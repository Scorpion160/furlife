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

export type ShipmentMediaPurpose = 'DECLARATION_PHOTO';

export type ShipmentMediaView = {
  id: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: string;
  sha256: string;
  purpose: ShipmentMediaPurpose;
  createdAt: string;
};

export type CreateShipmentMediaUploadRequest = {
  contentType: ShipmentMediaView['contentType'];
  sizeBytes: number;
  sha256: string;
  purpose: ShipmentMediaPurpose;
};

export type ShipmentMediaUploadIntent = CreateShipmentMediaUploadRequest & {
  objectKey: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
};

export type ConfirmShipmentMediaUploadRequest =
  CreateShipmentMediaUploadRequest & {
    objectKey: string;
  };

export type ShipmentMediaDownload = {
  downloadUrl: string;
  expiresAt: string;
};

export type NotificationView = {
  id: string;
  type: string;
  title: string;
  body: string;
  relatedType: string | null;
  relatedId: string | null;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
};

export type NotificationUnreadCount = {
  count: number;
};

export type TripStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'OPEN'
  | 'FULL'
  | 'DEPARTED'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'CANCELLED';

export type CreateTripDraftRequest = {
  corridorId: string;
  flightNo: string;
  departureAt: string;
  capacityKg: number;
};

export type SubmitTripRequest = {
  version: number;
};

export type TripView = {
  id: string;
  status: TripStatus;
  version: number;
  flightNo: string;
  departureAt: string;
  capacityKg: string;
  reservedKg: string;
  availableKg: string;
  createdAt: string;
  updatedAt: string;
  corridor: ShipmentCorridor;
};

export type TransitionTripRequest = {
  version: number;
};

export type TripReviewView = TripView & {
  carrierId: string;
};

export type MatchStatus =
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export type MatchProposalView = {
  id: string;
  status: MatchStatus;
  score: number;
  createdAt: string;
  updatedAt: string;
  trip: {
    id: string;
    flightNo: string;
    departureAt: string;
    capacityKg: string;
    reservedKg: string;
    availableKg: string;
    corridor: ShipmentCorridor;
  };
};

export type AcceptMatchResult = MatchProposalView;

export type PricingRuleView = {
  id: string;
  corridorId: string;
  baseFee: string;
  pricePerKg: string;
  minimumFee: string;
  currency: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  corridor: {
    id: string;
    originCountry: string;
    originCity: string;
    destinationCountry: string;
    destinationCity: string;
  };
};

export type UpsertPricingRuleRequest = {
  baseFee: string;
  pricePerKg: string;
  minimumFee: string;
  isActive: boolean;
  version?: number;
};

export type PricingQuoteView = {
  id: string;
  shipmentId: string;
  matchId: string;
  pricingRuleId: string;
  currency: string;
  weightKg: string;
  baseFee: string;
  variableFee: string;
  totalAmount: string;
  ruleVersion: number;
  createdAt: string;
};
