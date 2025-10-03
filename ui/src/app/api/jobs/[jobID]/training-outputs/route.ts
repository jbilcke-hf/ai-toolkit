import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { getTrainingFolder } from '@/server/settings';
import archiver from 'archiver';
import { Readable } from 'stream';

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { jobID: string } }) {
  const { jobID } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'data' or 'samples'

  const job = await prisma.job.findUnique({
    where: { id: jobID },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const trainingFolder = await getTrainingFolder();
  const jobFolder = path.join(trainingFolder, job.name);

  if (!fs.existsSync(jobFolder)) {
    return NextResponse.json({ error: 'Job folder not found' }, { status: 404 });
  }

  // If type is specified, generate and return a ZIP file
  if (type === 'data' || type === 'samples') {
    const archive = archiver('zip', {
      zlib: { level: 0 } // No compression for speed
    });

    const chunks: Buffer[] = [];
    archive.on('data', (chunk) => chunks.push(chunk));

    if (type === 'data') {
      // Add training data files (optimizer.pt, *.json, *.yaml, *.yml, *.md, *.txt)
      const dataExtensions = ['.pt', '.json', '.yaml', '.yml', '.md', '.txt'];
      const files = fs.readdirSync(jobFolder).filter(file => {
        const ext = path.extname(file).toLowerCase();
        return dataExtensions.includes(ext) && !file.endsWith('.safetensors');
      });

      for (const file of files) {
        const filePath = path.join(jobFolder, file);
        if (fs.statSync(filePath).isFile()) {
          archive.file(filePath, { name: file });
        }
      }
    } else if (type === 'samples') {
      // Add all files from samples directory
      const samplesDir = path.join(jobFolder, 'samples');
      if (fs.existsSync(samplesDir) && fs.statSync(samplesDir).isDirectory()) {
        archive.directory(samplesDir, false);
      }
    }

    await archive.finalize();

    const buffer = Buffer.concat(chunks);

    const filename = type === 'data' ? 'training_data.zip' : 'training_samples.zip';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${job.name}_${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  }

  // If no type specified, return info about available files
  const response: {
    trainingData: { available: boolean; files: string[]; totalSize: number };
    samples: { available: boolean; count: number; totalSize: number };
  } = {
    trainingData: { available: false, files: [], totalSize: 0 },
    samples: { available: false, count: 0, totalSize: 0 },
  };

  // Check for training data files
  const dataExtensions = ['.pt', '.json', '.yaml', '.yml', '.md', '.txt'];
  const dataFiles = fs.readdirSync(jobFolder).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return dataExtensions.includes(ext) && !file.endsWith('.safetensors');
  });

  if (dataFiles.length > 0) {
    response.trainingData.available = true;
    response.trainingData.files = dataFiles;
    response.trainingData.totalSize = dataFiles.reduce((sum, file) => {
      const filePath = path.join(jobFolder, file);
      return sum + (fs.existsSync(filePath) ? fs.statSync(filePath).size : 0);
    }, 0);
  }

  // Check for samples
  const samplesDir = path.join(jobFolder, 'samples');
  if (fs.existsSync(samplesDir) && fs.statSync(samplesDir).isDirectory()) {
    const sampleFiles = fs.readdirSync(samplesDir);
    if (sampleFiles.length > 0) {
      response.samples.available = true;
      response.samples.count = sampleFiles.length;
      response.samples.totalSize = sampleFiles.reduce((sum, file) => {
        const filePath = path.join(samplesDir, file);
        return sum + (fs.existsSync(filePath) ? fs.statSync(filePath).size : 0);
      }, 0);
    }
  }

  return NextResponse.json(response);
}
