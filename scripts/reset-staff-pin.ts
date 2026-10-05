import { localPinReset } from '../lib/staff-auth';
const [username]=process.argv.slice(2);
if(!username){console.error('Usage: npm run staff:reset-pin -- employee-id');process.exit(1);}
try{const result=localPinReset(username);console.log(`PIN reset for ${result.user.username}\nPIN (shown once): ${result.pin}\nExisting sessions were signed out. Share privately.`);}catch(error){console.error(error instanceof Error?error.message:'Unable to reset PIN.');process.exit(1);}
