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
   * El pasajero respondió a la propuesta
   * del conductor con un nuevo precio.
   *
   * El turno vuelve al conductor, que puede
   * aceptar, contraofertar o rechazar.
   */
  PASSENGER_COUNTERED = 'PASSENGER_COUNTERED',

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
