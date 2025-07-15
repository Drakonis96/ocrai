import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ProgressBar from './ProgressBar';

const API_URL = '/api';

function ProcessingQueue() {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    const fetchJobs = () => {
      axios.get(`${API_URL}/jobs`)
        .then(res => setJobs(res.data.jobs))
        .catch(() => {});
    };
    fetchJobs();
    const interval = setInterval(fetchJobs, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleStop = (jobId) => {
    axios.post(`${API_URL}/stop/${jobId}`).catch(() => {});
  };

  if (jobs.length === 0) return null;

  return (
    <div className="queue-container">
      <h3 className="queue-title">Processing Queue</h3>
      {jobs.map(job => (
        <div key={job.job_id} className="queue-item">
          <div className="queue-header">
            <span className="queue-filename">{job.filename}</span>
            <button
              onClick={() => handleStop(job.job_id)}
              className="btn btn-sm btn-danger"
            >
              ⏹️
            </button>
          </div>
          <ProgressBar
            progress={job.progress}
            status={job.status}
            currentPage={job.current_page}
            totalPages={job.total_pages}
          />
        </div>
      ))}
    </div>
  );
}

export default ProcessingQueue;
