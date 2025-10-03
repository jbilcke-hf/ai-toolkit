'use client';
import { createGlobalState } from 'react-global-hooks';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { FaUpload } from 'react-icons/fa';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { apiClient } from '@/utils/api';
import JSZip from 'jszip';

export interface AutomaticImportModalState {
  onComplete?: () => void;
}

export const automaticImportModalState = createGlobalState<AutomaticImportModalState | null>(null);

export const openAutomaticImportModal = (onComplete?: () => void) => {
  automaticImportModalState.set({ onComplete });
};

type ImportMode = 'closest' | 'trim' | 'auto-create';

export default function AutomaticImportModal() {
  const [modalInfo, setModalInfo] = automaticImportModalState.use();
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [importMode, setImportMode] = useState<ImportMode>('closest');
  const open = modalInfo !== null;

  const onCancel = () => {
    if (!isUploading) {
      setModalInfo(null);
      setImportMode('closest');
    }
  };

  const onDone = () => {
    if (modalInfo?.onComplete && !isUploading) {
      modalInfo.onComplete();
      setModalInfo(null);
      setImportMode('closest');
    }
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      setIsUploading(true);
      setUploadProgress(0);

      const formData = new FormData();
      let totalFiles = 0;
      const captionFiles = new Map<string, File>(); // Store caption files by base name

      // Process each file
      for (const file of acceptedFiles) {
        // Skip hidden files
        if (file.name.startsWith('.') || file.name.startsWith('._')) {
          continue;
        }

        // Check if it's a zip file
        if (file.name.toLowerCase().endsWith('.zip') ||
            file.type === 'application/zip' ||
            file.type === 'application/x-zip-compressed') {
          try {
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);

            // Extract files from zip
            for (const [fileName, zipEntry] of Object.entries(zipContent.files)) {
              // Skip directories and hidden files
              if (zipEntry.dir || fileName.startsWith('.') || fileName.includes('/.') ||
                  fileName.includes('__MACOSX') || fileName.startsWith('._')) {
                continue;
              }

              // Check if it's a supported file type
              const ext = fileName.toLowerCase().split('.').pop();
              const supportedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'mp4', 'txt'];

              if (ext && supportedExtensions.includes(ext)) {
                const blob = await zipEntry.async('blob');
                const extractedFileName = fileName.split('/').pop() || fileName;

                if (ext === 'txt') {
                  // Store caption file
                  const baseName = extractedFileName.substring(0, extractedFileName.lastIndexOf('.'));
                  const textContent = await zipEntry.async('text');
                  const captionFile = new File([textContent], extractedFileName, { type: 'text/plain' });
                  captionFiles.set(baseName, captionFile);
                } else {
                  // Media file
                  const extractedFile = new File([blob], extractedFileName, {
                    type: blob.type || `image/${ext}` // Fallback type
                  });
                  formData.append('files', extractedFile);
                  totalFiles++;
                }
              }
            }
          } catch (error) {
            console.error('Error extracting zip file:', error);
          }
        } else {
          // Regular file
          const ext = file.name.toLowerCase().split('.').pop();

          if (ext === 'txt') {
            // Store caption file
            const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
            captionFiles.set(baseName, file);
          } else {
            // Media file, add directly
            formData.append('files', file);
            totalFiles++;
          }
        }
      }

      // Add caption files to formData
      for (const [baseName, captionFile] of captionFiles) {
        formData.append('captions', captionFile);
        formData.append('captionBaseNames', baseName);
      }

      if (totalFiles === 0) {
        console.log('No valid files to upload');
        setIsUploading(false);
        setUploadProgress(0);
        return;
      }

      formData.append('importMode', importMode);

      try {
        await apiClient.post(`/api/datasets/automatic-import`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: progressEvent => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 100));
            setUploadProgress(percentCompleted);
          },
          timeout: 0, // Disable timeout
        });

        onDone();
      } catch (error) {
        console.error('Upload failed:', error);
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [modalInfo, importMode],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp'],
      'video/mp4': ['.mp4'],
      'application/zip': ['.zip'],
      'application/x-zip-compressed': ['.zip'],
      'text/plain': ['.txt'],
    },
    multiple: true,
  });

  return (
    <Dialog open={open} onClose={onCancel} className="relative z-10">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-900/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />

      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className="relative transform overflow-hidden rounded-lg bg-gray-800 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:max-w-xl data-closed:sm:translate-y-0 data-closed:sm:scale-95"
          >
            <div className="bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="text-center">
                <DialogTitle as="h3" className="text-base font-semibold text-gray-200 mb-4">
                  Automatic Import
                </DialogTitle>

                <div className="mb-4 text-left">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Import Mode:</label>
                  <div className="space-y-2">
                    <label className="flex items-start">
                      <input
                        type="radio"
                        name="importMode"
                        value="closest"
                        checked={importMode === 'closest'}
                        onChange={() => setImportMode('closest')}
                        className="mr-2 mt-1"
                        disabled={isUploading}
                      />
                      <div>
                        <div className="font-medium text-gray-200">Import to closest dataset</div>
                        <div className="text-xs text-gray-400">Files will be imported to the dataset with the closest frame count</div>
                      </div>
                    </label>

                    <label className="flex items-start">
                      <input
                        type="radio"
                        name="importMode"
                        value="trim"
                        checked={importMode === 'trim'}
                        onChange={() => setImportMode('trim')}
                        className="mr-2 mt-1"
                        disabled={isUploading}
                      />
                      <div>
                        <div className="font-medium text-gray-200">Import to closest dataset, trim length if needed</div>
                        <div className="text-xs text-gray-400">Videos will be trimmed to match the dataset frame count</div>
                      </div>
                    </label>

                    <label className="flex items-start">
                      <input
                        type="radio"
                        name="importMode"
                        value="auto-create"
                        checked={importMode === 'auto-create'}
                        onChange={() => setImportMode('auto-create')}
                        className="mr-2 mt-1"
                        disabled={isUploading}
                      />
                      <div>
                        <div className="font-medium text-gray-200">Import to existing dataset when possible or create new one</div>
                        <div className="text-xs text-gray-400">New datasets will be created with 4n+1 frame patterns</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="w-full">
                  <div
                    {...getRootProps()}
                    className={`h-40 w-full flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200
                      ${isDragActive ? 'border-blue-500 bg-blue-50/10' : 'border-gray-600'} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input {...getInputProps()} disabled={isUploading} />
                    <FaUpload className="size-8 mb-3 text-gray-400" />
                    <p className="text-sm text-gray-200 text-center">
                      {isDragActive ? 'Drop the files here...' : 'Drag & drop images, videos, captions, or ZIP files here'}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">Supports images, MP4 videos, ZIP archives, and .txt caption files</p>
                  </div>
                  {isUploading && (
                    <div className="mt-4">
                      <div className="w-full bg-gray-700 rounded-full h-2.5">
                        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
                      </div>
                      <p className="text-sm text-gray-300 mt-2 text-center">Processing... {uploadProgress}%</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-gray-700 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
              <button
                type="button"
                onClick={onDone}
                disabled={isUploading}
                className={`inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-xs sm:ml-3 sm:w-auto
                  ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500'}`}
              >
                Done
              </button>
              <button
                type="button"
                data-autofocus
                onClick={onCancel}
                disabled={isUploading}
                className={`mt-3 inline-flex w-full justify-center rounded-md bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-700 sm:mt-0 sm:w-auto ring-0
                  ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Cancel
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
