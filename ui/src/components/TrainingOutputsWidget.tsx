import React from 'react';
import useTrainingOutputs from '@/hooks/useTrainingOutputs';
import { Loader2, AlertCircle, Download, FileArchive, Images } from 'lucide-react';

export default function TrainingOutputsWidget({ jobID, jobName }: { jobID: string; jobName: string }) {
  const { outputsInfo, status } = useTrainingOutputs(jobID, 5000);

  const cleanSize = (size: number) => {
    if (size < 1024) {
      return `${size} B`;
    } else if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    } else if (size < 1024 * 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
  };

  const hasOutputs = outputsInfo && (outputsInfo.trainingData.available || outputsInfo.samples.available);

  return (
    <div className="col-span-2 bg-gray-900 rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 border border-gray-800">
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FileArchive className="w-5 h-5 text-green-400" />
          <h2 className="font-semibold text-gray-100">Training Outputs</h2>
          {hasOutputs && (
            <span className="px-2 py-0.5 bg-gray-700 rounded-full text-xs text-gray-300">
              {(outputsInfo.trainingData.available ? 1 : 0) + (outputsInfo.samples.available ? 1 : 0)}
            </span>
          )}
        </div>
      </div>

      <div className="p-2">
        {status === 'loading' && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center justify-center py-4 text-rose-400 space-x-2">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">Error loading outputs</span>
          </div>
        )}

        {['success', 'refreshing'].includes(status) && outputsInfo && (
          <div className="space-y-1">
            {outputsInfo.trainingData.available && (
              <a
                href={`/api/jobs/${jobID}/training-outputs?type=data`}
                download={`${jobName}_training_data.zip`}
                className="group flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-all duration-200"
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <FileArchive className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <div className="flex text-sm text-gray-200">
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                        training_data
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      .zip ({outputsInfo.trainingData.files.length} files)
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-3 flex-shrink-0">
                  <span className="text-xs text-gray-400">{cleanSize(outputsInfo.trainingData.totalSize)}</span>
                  <div className="bg-green-500 bg-opacity-0 group-hover:bg-opacity-10 rounded-full p-1 transition-all">
                    <Download className="w-3 h-3 text-green-400" />
                  </div>
                </div>
              </a>
            )}

            {outputsInfo.samples.available && (
              <a
                href={`/api/jobs/${jobID}/training-outputs?type=samples`}
                download={`${jobName}_training_samples.zip`}
                className="group flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-all duration-200"
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <Images className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <div className="flex text-sm text-gray-200">
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                        training_samples
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      .zip ({outputsInfo.samples.count} samples)
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-3 flex-shrink-0">
                  <span className="text-xs text-gray-400">{cleanSize(outputsInfo.samples.totalSize)}</span>
                  <div className="bg-blue-500 bg-opacity-0 group-hover:bg-opacity-10 rounded-full p-1 transition-all">
                    <Download className="w-3 h-3 text-blue-400" />
                  </div>
                </div>
              </a>
            )}
          </div>
        )}

        {['success', 'refreshing'].includes(status) && !hasOutputs && (
          <div className="text-center py-4 text-gray-400 text-sm">No training outputs available</div>
        )}
      </div>
    </div>
  );
}
