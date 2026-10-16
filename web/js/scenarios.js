/*
 * Escenarios de la demo: momentos de la jornada a los que salta el presentador (o el jurado
 * desde el botón "Demo" del móvil). Cada uno dice qué punto del reto demuestra.
 */
(function (global) {
  'use strict';
  const H = global.H6;
  const L = H.LUCIA, M = H.MARTA;
  const ofOfficial = () => H.categoryStatus('OF', H.T(23, 0)).officialAt;

  global.H6_SCENARIOS = [
    {
      id: 'llegada', title: 'Llego a la grada',
      sub: 'Primera vez en un Hyatlón: introducción de 1 minuto.',
      reto: ['Comprender el formato'],
      time: () => L.mats[0] + 26 * 60, follow: [], route: '#/seguir', onboarding: true,
    },
    {
      id: 'tandas', title: '¿Por qué hay gente en fases distintas?',
      sub: 'Las tandas salen cada 15 min y se solapan en pista.',
      reto: ['Comprender las tandas'],
      time: () => L.mats[0] + 26 * 60, follow: [], route: '#/tandas',
    },
    {
      id: 'buscar', title: 'Busco a Lucía',
      sub: 'Por nombre o por el dorsal de la pegatina del brazo.',
      reto: ['Localizar al deportista'],
      time: () => L.mats[0] + 26 * 60, follow: [], route: '#/buscar/Lucía',
    },
    {
      id: 'carrera', title: 'Corre el km 4',
      sub: 'Entre dos alfombras: la posición es estimada (~).',
      reto: ['Seguir su progreso', 'Estimado vs confirmado'],
      time: () => L.mats[6] + Math.round((L.mats[7] - L.mats[6]) * 0.45), follow: [L.dorsal], route: '#/atleta/' + L.dorsal,
    },
    {
      id: 'estacion', title: 'Entra en el RowErg',
      sub: 'La alfombra de entrada lo confirma (✓). Aviso al móvil.',
      reto: ['Seguir su progreso', 'Estimado vs confirmado'],
      time: () => L.mats[7] - 8, follow: [L.dorsal], route: '#/atleta/' + L.dorsal,
    },
    {
      id: 'meta', title: 'Cruza la meta',
      sub: '1ª… pero provisional: aún quedan tandas por correr.',
      reto: ['Interpretar el resultado', 'Provisional vs definitivo'],
      time: () => L.mats[H.FINISH] - 6, follow: [L.dorsal], route: '#/atleta/' + L.dorsal,
    },
    {
      id: 'superada', title: 'Una tanda posterior la supera',
      sub: 'Marta llega 29 min después, pero con menos tiempo neto.',
      reto: ['Interpretar el resultado', 'Mantener el interés'],
      time: () => M.mats[H.FINISH] - 6, follow: [L.dorsal], route: '#/clasificacion/OF',
    },
    {
      id: 'oficial', title: 'Resultado oficial',
      sub: 'Terminan todas y los jueces validan la clasificación.',
      reto: ['Provisional vs definitivo'],
      time: () => ofOfficial() - 5, follow: [L.dorsal], route: '#/atleta/' + L.dorsal,
    },
  ];
})(window);
