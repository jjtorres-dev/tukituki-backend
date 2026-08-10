export enum RideOfferStatus {
  /*
   * TukiTuki envió la solicitud
   * al conductor.
   */
  OFFERED = 'OFFERED',

  /*
   * El conductor respondió con una propuesta.
   *
   * Puede ser:
   * - el mismo precio ofrecido por el pasajero; o
   * - una contraoferta.
   *
   * Todavía NO significa que ganó el viaje.
   */
  PROPOSED = 'PROPOSED',

  /*
   * El pasajero eligió finalmente
   * esta propuesta y este conductor.
   */
  ACCEPTED = 'ACCEPTED',

  /*
   * El conductor rechazó la solicitud.
   */
  REJECTED = 'REJECTED',

  /*
   * La oferta venció.
   */
  EXPIRED = 'EXPIRED',

  /*
   * La oferta dejó de ser válida porque,
   * por ejemplo, el pasajero eligió
   * otro conductor.
   */
  CANCELLED = 'CANCELLED',
}
