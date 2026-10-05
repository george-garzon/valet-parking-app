import { bootstrapAdmin } from '../lib/staff-auth';
const [username,name]=process.argv.slice(2);
if (!username || !name) { console.error('Usage: npm run staff:create-admin -- employee-id "Full Name"'); process.exit(1); }
try {
  const result=bootstrapAdmin(username,name);
  console.log(`Administrator created: ${result.user.username}\nPIN (shown once): ${result.pin}\nStore it securely and use it to sign in. No default PIN is configured.`);
} catch(error) { console.error(error instanceof Error ? error.message : 'Unable to create administrator.'); process.exit(1); }
