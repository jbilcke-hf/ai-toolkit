import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export interface TrainingOutputsInfo {
  trainingData: {
    available: boolean;
    files: string[];
    totalSize: number;
  };
  samples: {
    available: boolean;
    count: number;
    totalSize: number;
  };
}

export default function useTrainingOutputs(jobID: string | null, refreshInterval?: number) {
  const [outputsInfo, setOutputsInfo] = useState<TrainingOutputsInfo | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'refreshing'>('idle');

  const fetchOutputs = useCallback(async () => {
    if (!jobID) return;

    try {
      if (status === 'idle' || status === 'error') {
        setStatus('loading');
      } else if (status === 'success') {
        setStatus('refreshing');
      }

      const response = await axios.get(`/api/jobs/${jobID}/training-outputs`);
      setOutputsInfo(response.data);
      setStatus('success');
    } catch (error) {
      console.error('Error fetching training outputs:', error);
      setStatus('error');
    }
  }, [jobID, status]);

  useEffect(() => {
    if (!jobID) return;

    fetchOutputs();

    if (refreshInterval && refreshInterval > 0) {
      const interval = setInterval(fetchOutputs, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [jobID, refreshInterval]);

  return { outputsInfo, status, refreshOutputs: fetchOutputs };
}
