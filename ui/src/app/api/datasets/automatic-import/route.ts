import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import { getDatasetsRoot } from '@/server/settings';

interface VideoMetadata {
  frameCount: number;
  duration: number;
  fps: number;
}

// Get video metadata including frame count
async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('No video stream found'));
        return;
      }

      const duration = metadata.format.duration || 0;
      const fps = videoStream.avg_frame_rate ? eval(videoStream.avg_frame_rate) : 30;
      const frameCount = Math.floor(duration * fps);

      resolve({ frameCount, duration, fps });
    });
  });
}

// Trim video to specific frame count
async function trimVideo(inputPath: string, outputPath: string, targetFrames: number, fps: number): Promise<void> {
  const targetDuration = targetFrames / fps;

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setDuration(targetDuration)
      .output(outputPath)
      .videoCodec('copy')
      .audioCodec('copy')
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

// Check if a value follows the 4n+1 pattern
function is4nPlus1(value: number): boolean {
  return value === 1 || (value - 1) % 4 === 0;
}

// Get the closest 4n+1 value
function getClosest4nPlus1(value: number): number {
  if (is4nPlus1(value)) return value;

  // Find the closest 4n+1 values
  const lower = Math.floor((value - 1) / 4) * 4 + 1;
  const upper = Math.ceil((value - 1) / 4) * 4 + 1;

  // Return the closest one
  return (value - lower <= upper - value) ? lower : upper;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const captionFiles = formData.getAll('captions') as File[];
    const captionBaseNames = formData.getAll('captionBaseNames') as string[];
    const importMode = formData.get('importMode') as string;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Create a map of captions by base filename
    const captionsMap = new Map<string, string>();
    for (let i = 0; i < captionFiles.length; i++) {
      const captionFile = captionFiles[i];
      const baseName = captionBaseNames[i];
      const captionText = await captionFile.text();
      captionsMap.set(baseName, captionText);
    }

    const datasetsRoot = await getDatasetsRoot();

    // Get all existing datasets and their frame counts
    const datasets = await fs.readdir(datasetsRoot);
    const datasetInfo: { name: string; frameCount: number }[] = [];

    for (const dataset of datasets) {
      const datasetPath = path.join(datasetsRoot, dataset);
      const stat = await fs.stat(datasetPath);

      if (stat.isDirectory()) {
        // Parse frame count from dataset name (assuming format like "dataset_25frames")
        const match = dataset.match(/_(\d+)frames?$/);
        const frameCount = match ? parseInt(match[1]) : 1;
        datasetInfo.push({ name: dataset, frameCount });
      }
    }

    const results = [];

    for (const file of files) {
      // Skip hidden files
      if (file.name.startsWith('.') || file.name.startsWith('._')) {
        continue;
      }

      // Save file temporarily
      const tempDir = path.join(datasetsRoot, '.temp');
      await fs.mkdir(tempDir, { recursive: true });
      const tempPath = path.join(tempDir, file.name);

      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(tempPath, buffer);

      try {
        let frameCount = 1;
        let isVideo = false;

        // Check if it's a video
        if (file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4')) {
          isVideo = true;
          try {
            const metadata = await getVideoMetadata(tempPath);
            frameCount = metadata.frameCount;
          } catch (error) {
            console.error('Error getting video metadata:', error);
            // If we can't get metadata, treat as single frame
            frameCount = 1;
          }
        }

        let targetDataset: string;
        let targetFrameCount: number;

        if (importMode === 'auto-create') {
          // Mode 3: Create new dataset if needed with 4n+1 pattern
          const closest4nPlus1 = getClosest4nPlus1(frameCount);
          const existingDataset = datasetInfo.find(d => d.frameCount === closest4nPlus1);

          if (existingDataset) {
            targetDataset = existingDataset.name;
            targetFrameCount = existingDataset.frameCount;
          } else {
            // Create new dataset
            targetDataset = `dataset_${closest4nPlus1}frames`;
            targetFrameCount = closest4nPlus1;
            const newDatasetPath = path.join(datasetsRoot, targetDataset);
            await fs.mkdir(newDatasetPath, { recursive: true });
            datasetInfo.push({ name: targetDataset, frameCount: targetFrameCount });
          }
        } else {
          // Mode 1 & 2: Find closest existing dataset
          if (datasetInfo.length === 0) {
            // Create a default dataset if none exist
            targetDataset = 'dataset_1frame';
            targetFrameCount = 1;
            const newDatasetPath = path.join(datasetsRoot, targetDataset);
            await fs.mkdir(newDatasetPath, { recursive: true });
            datasetInfo.push({ name: targetDataset, frameCount: 1 });
          } else {
            // Find closest dataset (equal or lower frame count)
            const sortedDatasets = [...datasetInfo].sort((a, b) => a.frameCount - b.frameCount);
            const closest = sortedDatasets.reduce((prev, curr) => {
              if (curr.frameCount <= frameCount) {
                return curr;
              }
              return prev;
            }, sortedDatasets[0]);

            targetDataset = closest.name;
            targetFrameCount = closest.frameCount;
          }
        }

        // Determine final file path
        const targetDir = path.join(datasetsRoot, targetDataset);
        let finalPath = path.join(targetDir, file.name);
        let finalBaseName = file.name.substring(0, file.name.lastIndexOf('.'));

        // Handle trimming for mode 2
        if (importMode === 'trim' && isVideo && frameCount > targetFrameCount) {
          // Trim the video
          const trimmedName = file.name.replace(/\.mp4$/i, '_trimmed.mp4');
          finalPath = path.join(targetDir, trimmedName);
          finalBaseName = trimmedName.substring(0, trimmedName.lastIndexOf('.'));

          const metadata = await getVideoMetadata(tempPath);
          await trimVideo(tempPath, finalPath, targetFrameCount, metadata.fps);
        } else {
          // Copy file as-is
          await fs.copyFile(tempPath, finalPath);
        }

        // Save caption file if it exists for this media file
        const originalBaseName = file.name.substring(0, file.name.lastIndexOf('.'));
        if (captionsMap.has(originalBaseName)) {
          const captionPath = path.join(targetDir, finalBaseName + '.txt');
          await fs.writeFile(captionPath, captionsMap.get(originalBaseName)!);
        }

        results.push({
          file: file.name,
          dataset: targetDataset,
          frameCount,
          targetFrameCount,
          trimmed: importMode === 'trim' && frameCount > targetFrameCount,
          hasCaption: captionsMap.has(originalBaseName)
        });

      } finally {
        // Clean up temp file
        try {
          await fs.unlink(tempPath);
        } catch (error) {
          console.error('Error cleaning up temp file:', error);
        }
      }
    }

    // Clean up temp directory
    try {
      const tempDir = path.join(datasetsRoot, '.temp');
      await fs.rmdir(tempDir);
    } catch (error) {
      // Ignore if directory is not empty or doesn't exist
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Successfully imported ${results.length} files`
    });

  } catch (error) {
    console.error('Error in automatic import:', error);
    return NextResponse.json({
      error: 'Failed to import files',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
