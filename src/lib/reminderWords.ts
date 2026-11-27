// What the evening reminder says. The same facts as before (the streak, the minutes left, the book you are in), worded for the
// reader's age: easy-going for younger readers (no slang, no exclamation marks), courteous and inviting for older ones, and the
// plain voice in between (or when no age was given). A different line is chosen each day.
import type { AgeBand } from './types';

export type Tone = 'casual' | 'plain' | 'formal';
export const toneFor = (age?: AgeBand): Tone => (age === 'u18' || age === '18' ? 'casual' : age === '50' || age === '65' ? 'formal' : 'plain');

type Case = 'streak' | 'book' | 'first' | 'plain';
/** {hi} "Ana, " · {nm} ", Ana" · {greet} "Good evening" · {n} days in a row · {left} minutes left today · {goal} · {book} */
type Lines = Record<Tone, Record<Case, string[]>>;

const EN: Lines = {
  casual: {
    streak: ['{hi}day {n} is still open. {left} min and it’s done.', 'Your {n}-day streak is still going. {left} minutes tonight?', '{n} days in a row{nm}. Keep it going with {left} min?'],
    book: ['“{book}” is right where you left it. {goal} min?', 'Quick break from scrolling? “{book}” is waiting.', '{hi}a chapter of “{book}” before bed?'],
    first: ['{hi}{goal} minutes of reading tonight lights your first spot on the globe.', 'Got {goal} minutes? That’s your first light on the globe.'],
    plain: ['Got {goal} minutes{nm}? A chapter beats another scroll.', '{hi}your phone’s already in your hand. Read a bit?', '{goal} minutes, one book, no notifications. Deal?'],
  },
  plain: {
    streak: ['{hi}your {n}-day streak is waiting — {left} min to today’s light.', '{hi}{n} days in a row. Keep the light on today?'],
    book: ['{hi}“{book}” is open where you left it. A quiet {goal} minutes?', '{hi}your place in “{book}” is kept. Shall we go on?'],
    first: ['{hi}a few pages tonight? {goal} minutes lights your first place on the globe.'],
    plain: ['{hi}a quiet {goal} minutes with a book, maybe?', '{hi}some time to read today? {goal} minutes is enough.'],
  },
  formal: {
    streak: ['{greet}{nm}. You have read {n} days in a row; {left} more minutes would complete today.', '{greet}{nm}. Your {n}-day reading streak continues — {left} minutes, whenever you are ready.'],
    book: ['{greet}{nm}. “{book}” is waiting where you left it, whenever you wish to continue.', '{greet}{nm}. Perhaps a few pages of “{book}”?'],
    first: ['{greet}{nm}. A first {goal} minutes of reading would light your first place on the globe.'],
    plain: ['{greet}{nm}. Perhaps a quiet {goal} minutes with a good book?', '{greet}{nm}. There is time today for {goal} minutes of reading, if you would like.'],
  },
};

const ES: Lines = {
  casual: {
    streak: ['{hi}el día {n} sigue abierto. {left} min y queda hecho.', 'Tu racha de {n} días sigue viva. ¿{left} minutos esta noche?', '{n} días seguidos{nm}. ¿La sigues con {left} min?'],
    book: ['«{book}» sigue donde lo dejaste. ¿{goal} min?', '¿Un descanso del scroll? «{book}» te espera.', '{hi}¿un capítulo de «{book}» antes de dormir?'],
    first: ['{hi}{goal} minutos de lectura hoy encienden tu primera luz en el globo.', '¿Tienes {goal} minutos? Es tu primera luz en el globo.'],
    plain: ['¿Tienes {goal} minutos{nm}? Un capítulo gana a otro rato de scroll.', '{hi}ya tienes el móvil en la mano. ¿Lees un poco?', '{goal} minutos, un libro, cero notificaciones. ¿Hecho?'],
  },
  plain: {
    streak: ['{hi}tu racha de {n} días te espera — {left} min para la luz de hoy.', '{hi}{n} días seguidos. ¿Mantienes la luz encendida hoy?'],
    book: ['{hi}«{book}» está abierto donde lo dejaste. ¿Unos {goal} minutos tranquilos?', '{hi}tu página de «{book}» está guardada. ¿Seguimos?'],
    first: ['{hi}¿unas páginas esta noche? {goal} minutos encienden tu primer lugar en el globo.'],
    plain: ['{hi}¿unos {goal} minutos tranquilos con un libro?', '{hi}¿un rato para leer hoy? Con {goal} minutos basta.'],
  },
  formal: {
    streak: ['{greet}{nm}. Lleva {n} días seguidos leyendo; {left} minutos más completarían el día de hoy.', '{greet}{nm}. Su racha de {n} días continúa: {left} minutos, cuando usted quiera.'],
    book: ['{greet}{nm}. «{book}» le espera donde lo dejó, cuando desee continuar.', '{greet}{nm}. ¿Le apetecen unas páginas de «{book}»?'],
    first: ['{greet}{nm}. Unos primeros {goal} minutos de lectura encenderían su primer lugar en el globo.'],
    plain: ['{greet}{nm}. ¿Qué le parecen {goal} minutos tranquilos con un buen libro?', '{greet}{nm}. Hoy hay tiempo para {goal} minutos de lectura, si le apetece.'],
  },
};

const FR: Lines = {
  casual: {
    streak: ['{hi}le jour {n} est encore ouvert. {left} min et c’est fait.', 'Ta série de {n} jours tient toujours. {left} minutes ce soir ?', '{n} jours d’affilée{nm}. On continue avec {left} min ?'],
    book: ['« {book} » t’attend là où tu l’as laissé. {goal} min ?', 'Une pause dans le scroll ? « {book} » t’attend.', '{hi}un chapitre de « {book} » avant de dormir ?'],
    first: ['{hi}{goal} minutes de lecture ce soir allument ta première lumière sur le globe.', '{goal} minutes devant toi ? C’est ta première lumière sur le globe.'],
    plain: ['{goal} minutes{nm} ? Un chapitre vaut mieux qu’un autre scroll.', '{hi}ton téléphone est déjà dans ta main. Tu lis un peu ?', '{goal} minutes, un livre, zéro notification. Ça marche ?'],
  },
  plain: {
    streak: ['{hi}ta série de {n} jours t’attend — {left} min pour la lumière du jour.', '{hi}{n} jours d’affilée. On garde la lumière allumée ?'],
    book: ['{hi}« {book} » est ouvert là où tu l’as laissé. {goal} minutes au calme ?', '{hi}ta page de « {book} » est gardée. On continue ?'],
    first: ['{hi}quelques pages ce soir ? {goal} minutes allument ta première place sur le globe.'],
    plain: ['{hi}{goal} minutes au calme avec un livre, peut-être ?', '{hi}un moment pour lire aujourd’hui ? {goal} minutes suffisent.'],
  },
  formal: {
    streak: ['{greet}{nm}. Vous lisez depuis {n} jours d’affilée ; {left} minutes de plus compléteraient la journée.', '{greet}{nm}. Votre série de {n} jours se poursuit : {left} minutes, quand vous le souhaitez.'],
    book: ['{greet}{nm}. « {book} » vous attend là où vous l’avez laissé, quand vous voudrez reprendre.', '{greet}{nm}. Quelques pages de « {book} », peut-être ?'],
    first: ['{greet}{nm}. Une première lecture de {goal} minutes allumerait votre première place sur le globe.'],
    plain: ['{greet}{nm}. Que diriez-vous de {goal} minutes au calme avec un bon livre ?', '{greet}{nm}. Il reste du temps aujourd’hui pour {goal} minutes de lecture, si vous le souhaitez.'],
  },
};

const GREET: Record<string, [string, string]> = { en: ['Good afternoon', 'Good evening'], es: ['Buenas tardes', 'Buenas noches'], fr: ['Bon après-midi', 'Bonsoir'] };

export interface ReminderFacts {
  lang: string;
  age?: AgeBand;
  name: string; // '' when unknown
  streak: number; // days in a row so far
  left: number; // minutes left to today's goal
  goal: number;
  total: number; // days ever read
  book?: string; // the book in progress
  hour: number; // when the reminder will show
  day: number; // which line to choose
  tomorrow: boolean; // planned for the next day
}

export function reminderBody(f: ReminderFacts): string {
  const L = f.lang === 'es' ? ES : f.lang === 'fr' ? FR : EN;
  const tone = toneFor(f.age);
  const c: Case = f.streak >= 2 && !f.tomorrow ? 'streak' : f.book ? 'book' : !f.total ? 'first' : f.streak >= 2 ? 'streak' : 'plain';
  const list = L[tone][c];
  const line = list[f.day % list.length];
  const greet = (GREET[f.lang] ?? GREET.en)[f.hour >= (f.lang === 'es' ? 21 : 18) ? 1 : 0];
  const out = line
    .replace('{hi}', f.name ? `${f.name}, ` : '')
    .replace('{nm}', f.name ? `, ${f.name}` : '')
    .replace('{greet}', greet)
    .replace('{n}', String(f.streak))
    .replace(/\{left\}/g, String(f.tomorrow ? f.goal : f.left))
    .replace(/\{goal\}/g, String(f.goal))
    .replace('{book}', f.book ?? '');
  // "¿unos…" / "your…" at the start once the name is left out
  return out.replace(/^(¿|« |“)?(\p{Ll})/u, (_m, p = '', ch: string) => p + ch.toUpperCase());
}

export const AGE_OPTIONS: { value: AgeBand; label: string; aria: string }[] = [
  { value: 'u18', label: '<18', aria: 'Under 18' },
  { value: '18', label: '18–29', aria: '18 to 29' },
  { value: '30', label: '30–49', aria: '30 to 49' },
  { value: '50', label: '50–64', aria: '50 to 64' },
  { value: '65', label: '65+', aria: '65 and over' },
];
