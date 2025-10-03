import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { getTrainingFolder } from '@/server/settings';

const prisma = new PrismaClient();

/**
 * Sync job progress from filesystem (checkpoint files)
 * Reads the latest checkpoint filename to determine the current step
 */
export async function POST(request: NextRequest, { params }: { params: { jobID: string } }) {
  const { jobID } = await params;

  const job = await prisma.job.findUnique({
    where: { id: jobID },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  try {
    const trainingRoot = await getTrainingFolder();
    const trainingFolder = path.join(trainingRoot, job.name);

    if (!fs.existsSync(trainingFolder)) {
      return NextResponse.json(
        { error: 'Training folder not found', step: 0 },
        { status: 404 }
      );
    }

    // Find all checkpoint files matching pattern: {name}_{step:09d}.safetensors
    const files = fs.readdirSync(trainingFolder);
    const checkpointPattern = new RegExp(`^${job.name}_(\\d{9})\\.safetensors$`);

    let maxStep = 0;
    let foundCheckpoint = false;

    for (const file of files) {
      const match = file.match(checkpointPattern);
      if (match) {
        foundCheckpoint = true;
        const step = parseInt(match[1], 10);
        if (step > maxStep) {
          maxStep = step;
        }
      }
    }

    // Update the database with the found step
    if (foundCheckpoint) {
      await prisma.job.update({
        where: { id: jobID },
        data: {
          step: maxStep,
        },
      });

      return NextResponse.json({
        success: true,
        step: maxStep,
        message: `Synced job progress to step ${maxStep}`,
      });
    } else {
      // No checkpoints found, set to 0
      await prisma.job.update({
        where: { id: jobID },
        data: {
          step: 0,
        },
      });

      return NextResponse.json({
        success: true,
        step: 0,
        message: 'No checkpoints found, step set to 0',
      });
    }
  } catch (error: any) {
    console.error('Error syncing job progress:', error);
    return NextResponse.json(
      {
        error: 'Failed to sync job progress',
        details: error?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
