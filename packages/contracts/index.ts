export type UserRole =
  | 'CLIENT'
  | 'CARRIER'
  | 'COURIER'
  | 'OPERATOR'
  | 'SUPPORT'
  | 'FINANCE'
  | 'ADMIN';

export type ApiError = {
  code: string;
  message: string;
  traceId: string;
};

export type ShipmentStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'MATCHING'
  | 'MATCHED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'PICKUP_ASSIGNED'
  | 'PICKED_UP'
  | 'INSPECTED'
  | 'WITH_CARRIER'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'LAST_MILE'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'INCIDENT'
  | 'CANCELLED';

export type ShipmentDraftParcelInput = {
  categoryId: string;
  description: string;
  declaredWeight: number;
};

export type CreateShipmentDraftRequest = {
  corridorId: string;
  declaredValue?: number;
  parcels: ShipmentDraftParcelInput[];
};

export type SubmitShipmentRequest = {
  version: number;
};

export type ShipmentCorridor = {
  id: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  currency: string;
};

export type ShipmentParcel = {
  id: string;
  description: string;
  declaredWeight: string;
  actualWeight: string | null;
  sealNo: string | null;
  category: {
    id: string;
    code: string;
    label: string;
    constraints: unknown;
  };
};

export type ShipmentView = {
  id: string;
  publicRef: string;
  status: ShipmentStatus;
  version: number;
  declaredValue: string | null;
  currentCustodianId: string | null;
  createdAt: string;
  updatedAt: string;
  corridor: ShipmentCorridor;
  parcels: ShipmentParcel[];
};
