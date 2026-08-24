import { DriverDocumentType } from './enums/driver-document-type.enum';

/*
 * DRIVER-ONBOARDING-R2: expediente objetivo reducido de 6 a 3
 * documentos. DNI_FRONT/DNI_BACK/PROFILE_PHOTO se conservan en el
 * enum por compatibilidad con registros legacy, pero dejan de ser
 * obligatorios. La foto de perfil pasa a ser DriverProfile.photoUrl/
 * photoObjectKey, no un documento del expediente.
 *
 * Única fuente de verdad de "cuántos y cuáles documentos se exigen":
 * reutilizada por DriverApplicationSubmissionService (envío del
 * conductor) y AdminDriverReviewService (aprobación del admin) para
 * que ambos nunca vuelvan a divergir.
 */
export const REQUIRED_DRIVER_APPLICATION_DOCUMENT_TYPES: readonly DriverDocumentType[] =
  [
    DriverDocumentType.DRIVER_LICENSE,
    DriverDocumentType.SOAT,
    DriverDocumentType.VEHICLE_REGISTRATION,
  ];
