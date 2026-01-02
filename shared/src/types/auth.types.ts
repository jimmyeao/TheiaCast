export interface User {
  id: number;
  username: string;
  email?: string;
  displayName?: string;
  isMfaEnabled: boolean;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LoginDto {
  username: string;
  password: string;
  mfaCode?: string;
}

export interface RegisterDto {
  username: string;
  password: string;
  email?: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface MfaSetupResponse {
  secret: string;
  qrCodeUri: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

export interface JwtPayload {
  sub: number;
  username: string;
  iat?: number;
  exp?: number;
}

// User management DTOs
export interface CreateUserDto {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
}

export interface UpdateUserDto {
  email?: string;
  displayName?: string;
  password?: string;
}

export interface UserListDto {
  id: number;
  username: string;
  email?: string;
  displayName?: string;
  isMfaEnabled: boolean;
  lastLoginAt?: Date;
}

// License management interfaces
export interface License {
  id: number;
  key: string;
  keyHash: string;
  tier: string;
  maxDevices: number;
  currentDeviceCount: number;
  companyName?: string;
  contactEmail?: string;
  isActive: boolean;
  expiresAt?: Date;
  activatedAt?: Date;
  createdAt: Date;
  lastValidatedAt?: Date;
  notes?: string;
}

export interface LicenseStatus {
  tier: string;
  maxDevices: number;
  currentDevices: number;
  isValid: boolean;
  isInGracePeriod: boolean;
  gracePeriodEndsAt?: Date;
  expiresAt?: Date;
  reason?: string;
  activeLicenseCount?: number;
}

export interface InstallationKeyResponse {
  installationKey: string;
  generatedAt: Date;
}

export interface DecodedLicenseInfo {
  id: number;
  version: number;
  tier: string;
  maxDevices: number;
  currentDevices: number;
  companyName?: string;
  expiresAt?: string;
  issuedAt?: string;
  isPerpetual: boolean;
  isExpired: boolean;
  message?: string;
}

export interface DecodedLicenseResponse {
  hasLicense: boolean;
  totalMaxDevices?: number;
  currentDevices?: number;
  activeLicenseCount?: number;
  licenses?: DecodedLicenseInfo[];
  message?: string;

  // Legacy fields for backwards compatibility (single license response)
  version?: number;
  tier?: string;
  maxDevices?: number;
  companyName?: string;
  expiresAt?: string;
  issuedAt?: string;
  isPerpetual?: boolean;
  isExpired?: boolean;
}

export interface GenerateLicenseDto {
  tier: string;
  maxDevices: number;
  companyName?: string;
  expiresAt?: Date;
}

export interface UpdateLicenseDto {
  isActive?: boolean;
  expiresAt?: Date;
  notes?: string;
}

export interface ActivateLicenseDto {
  licenseKey: string;
}
