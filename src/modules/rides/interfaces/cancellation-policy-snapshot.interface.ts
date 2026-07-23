export interface CancellationPolicySnapshot {
  policyId: string | null;
  gracePeriodSeconds: number;
  assignedFee: string;
  arrivingFee: string;
  arrivedFee: string;
  passengerNoShowFee: string;
  driverNoShowCompensation: string;
  driverArrivalWaitSeconds: number;
  driverNoProgressSeconds: number;
  driverNoProgressMinMeters: number;
  currency: string;
}
