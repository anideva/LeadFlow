import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[LeadFlow Server] running on http://localhost:${PORT}`);
  console.log(`[LeadFlow Server] Health check at http://localhost:${PORT}/api/health`);
});
