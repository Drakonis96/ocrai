import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ProgressBar from './ProgressBar';

const API_URL = '/api';

function JobQueue() {
  const [jobs, setJobs] = useState({});

  useEffect(() => {
    const fetchJobs = () => {
      axios.get(`${API_URL}/jobs`).then(res => {
        setJobs(res.data.jobs || {});
      }).catch(() => {});
    };
    fetchJobs();
    const interval = setInterval(fetchJobs, 2000);
    return () => clearInterval(interval);
  }, []);

  const jobIds = Object.keys(jobs);

  if (jobIds.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⏳</div>
        <h3 className="empty-state-title">No tasks in queue</h3>
      </div>
    );
  }

  return (
    <div className="job-queue">
      {jobIds.map(id => (
        <div key={id} className="card">
          <div className="card-header">
            <h3 className="card-title">{jobs[id].filename || id}</h3>
          </div>
          <ProgressBar
            progress={jobs[id].progress}
            status={jobs[id].status}
            currentPage={jobs[id].current_page}
            totalPages={jobs[id].total_pages}
          />
        </div>
      ))}
    </div>
  );
}

export default JobQueue;
