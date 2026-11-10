/*
 * The pictogram sheet — a review surface, not a screen.
 *
 * Every exercise the app can draw, one cell per key, so the artwork can be judged as a set:
 * proportions, line weight and whether two variants of the same movement really look
 * different. It lives in the gallery because the gallery is where the owner inspects the
 * design system without walking through a workout.
 */
import { ExerciseIllustration } from '../../features/session/ExerciseIllustration';
import { PICTOGRAMS } from '../../features/session/pictograms';
import { Demo, Section } from './parts';
import './gallery.css';

const KEYS = Object.keys(PICTOGRAMS).sort();

export function ArtSections(): React.ReactElement {
  return (
    <Section
      name="Ilustraciones de ejercicio"
      note={`${String(KEYS.length)} dibujos originales, uno por variante concreta: mismo suelo, misma cabeza y mismo trazo. Una variante sin dibujo cae al icono del material en lugar de heredar el de un vecino.`}
    >
      <Demo state="Todas las claves">
        <ul className="gallery__art-grid">
          {KEYS.map((key) => (
            <li className="gallery__art-cell" key={key}>
              <ExerciseIllustration illustration={key as never} label={key} />
              <span className="gallery__art-key">{key}</span>
            </li>
          ))}
        </ul>
      </Demo>
    </Section>
  );
}
