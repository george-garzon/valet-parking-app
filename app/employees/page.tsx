import { Suspense } from 'react';
import StaffGate from '@/components/staff-gate';
import EmployeeUsers from '@/components/employee-users';
export default function Page(){return <Suspense fallback={<p>Loading employee access…</p>}><StaffGate><EmployeeUsers /></StaffGate></Suspense>;}
