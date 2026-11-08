# Rupfit — Training Science

What this document is: the evidence base and the operating rules the progression
engine implements. Every rule the app applies to a load must appear here either as
evidence-backed or as an explicit design decision.

What this document is not: medical advice. Rupfit organises training. It does not
diagnose, treat or screen for injury or disease. Pain reported to the app reduces
load and stops progression; it never triggers a diagnosis.

---

## 1. Evidence policy

Three labels are used and never mixed:

| Label | Meaning | Rule |
| --- | --- | --- |
| **EV** | Supported by the cited literature | Must carry a reference ID from §12 |
| **DD** | Design decision made for this product | Must state the reason and the alternative rejected |
| **UP** | The owner's stated preference | Traced to the product brief, not to science |

Anything that cannot be labelled EV stays DD or UP. No number in this document is
presented as a scientific constant when it is a product choice.

### Verification method

Every reference in §12 was resolved on **2026-11-08** through the Crossref REST API
(`https://api.crossref.org/works/{doi}`), checking that the DOI resolves and that
the returned title matches the cited title. No reference was written from memory
alone, and no citation was added after the check.

The check caught one real defect: the commonly quoted DOI for the RIR scale
(`10.1519/JSC.0000000000001047`) resolves to an unrelated paper on eccentric
torque in older adults. The correct record is `10.1519/JSC.0000000000001049`
(R3). A citation that had been trusted from memory would have been wrong.

Where a DOI record gives first-issued and issue years that differ (online-first
publication), the year shown here is the Crossref first-issued year, and the DOI
travels with it so the record can be re-checked at any time.

---

## 2. Design constraints inherited from the evidence

These four constraints shape the whole engine and are not negotiable at
implementation time:

1. **Effort, not rep count, drives adaptation.** Sets near failure stimulate
   adaptation; sets far from failure do not, and sets at failure cost more fatigue
   than they return (R6, R7, R1). The app therefore asks for effort on every set
   and never assumes an answer.
2. **Volume is the main lever and it has diminishing returns.** Weekly sets per
   muscle group predict hypertrophy better than any other single variable, up to a
   point (R4). Volume is ramped, never jumped.
3. **Progression can be load or repetitions.** Adding load and adding reps both
   produce adaptation when effort is comparable (R6, R13). The engine is therefore
   a double-progression engine, not a load calculator.
4. **Frequency is a distribution tool.** With weekly volume equated, differences
   between training frequencies are small (R5). Three sessions per week is a
   scheduling choice (UP), not a physiological optimum.

---

## 3. Principles of programming

| # | Principle | Label | Basis |
| --- | --- | --- | --- |
| P-1 | Specificity: the movement you train improves, in the rep range you train it | EV | R1, R2 |
| P-2 | Overload must be progressive; a static programme stops producing adaptation | EV | R1, R2 |
| P-3 | Fatigue is a cost; a session must be recoverable before the next one | EV | R7, R9 |
| P-4 | Individual response varies widely; any fixed number is a starting hypothesis | EV | R4, R9 |
| P-5 | Adherence outranks optimisation: a sustainable programme wins | DD | Owner goal 6 (UP); no trial can rank this higher |
| P-6 | Technique and discomfort take precedence over the planned load | DD | Safety of a returning trainee; see §6 |
| P-7 | The user's decision about today's load is final | UP | Brief §5, "El usuario tiene siempre la última palabra" |

---

## 4. Volume

- **EV** Weekly sets per muscle group is associated with hypertrophy, with greater
  effect at and above roughly 10 hard sets per week and diminishing returns as
  volume climbs further (R4). This is a meta-regression over short trials of
  heterogeneous quality; it identifies a direction, not a universal optimum.
- **DD** Normal-phase target for this user: **10–16 hard sets per muscle group per
  week**, inside 3 sessions. Chosen because the user trains for general strength
  and body composition, not maximal hypertrophy, and because a returner's
  tolerance to volume is the limiting factor before 16 sets is reached.
- **DD** Readaptation starts at **4–6 sets per muscle group per week** and adds no
  more than ~4 sets per muscle group per week, only when the gate in §6 passes.
- **DD** A *hard set* is one answered `correcto`, `duro` or `fallo` (≤2 RIR).
  `fácil` is excluded because the button means ≥3 RIR and cannot prove the set was
  within 3 of failure; the count therefore undercounts rather than overcounts. An
  unanswered effort counts toward no hard-set total (FR-7.3); missing is not a
  value. This is why the volume calculation depends on effort answers.

---

## 5. Intensity and rep ranges

- **EV** When effort is comparable, loads from roughly 30 % to 85 % of 1RM produce
  similar hypertrophy; heavier loads favour maximal strength (R6). For a
  strength-first goal, the working range should sit in the heavier half.
- **DD** Prescription:

  | Role | Reps | Target RIR | Approx. %1RM | Sets |
  | --- | --- | --- | --- | --- |
  | Primary lift, normal phase | 6–10 | 1–3 | 70–85 % | 3–4 |
  | Primary lift, readaptation | 8–12 | 2–5 | 55–70 % | 2–3 |
  | Accessory | 8–15 | 1–3 | 60–75 % | 2–3 |
  | Isolation / core | 10–20 | 1–2 | 50–65 % | 2–3 |

  The percentage column is a sanity range for the UI, never an input to the load
  calculation: the engine works from real weights and real reps, not from an
  assumed 1RM (a 1RM the user has never tested would be invented data).
- **EV** Repetitions in reserve is a usable proxy for proximity to failure. Its
  accuracy is better in low-rep sets with trained lifters and degrades in high-rep
  sets, so it is treated as a self-report, not a measurement (R3, R7).
- **DD / UP** Effort is captured as four buttons — `fácil` (≥3 RIR), `correcto`
  (2 RIR), `duro` (1 RIR), `fallo` (0 RIR) — because typing or a slider during a
  set violates the gym-use constraint. Four steps is the coarsest scale that still
  separates "hard but repeatable" from "at failure". Answering is optional and
  never blocks set confirmation; an unanswered set stays unanswered (FR-7.3) and is
  never read as `fácil`.
- **EV** Training to failure is not required for hypertrophy (R9). **DD** It is
  prohibited during readaptation and discouraged in the normal phase, where the
  target is 1–3 RIR on the primary lift.

---

## 6. Readaptation phase (the part with the weakest direct evidence)

**Honest statement first:** there is no high-quality trial of *this specific
population* — a previously trained lifter returning after about twelve months —
tested against a defined reintroduction protocol. The protocol below is
**DD**, extrapolated from three adjacent evidence bodies:

- **EV** Detraining: strength and muscle size decline during inactivity, and the
  rate and magnitude depend on training status and duration (R10). A twelve-month
  layoff should be treated as a return to near-novice working capacities, not as a
  short deload.
- **EV** Retraining and retained capacity: interrupted training does not prevent
  regaining previously held muscle size and strength, and periodic training can
  match continuous training over the same period (R11). Re-adaptation is faster
  than first acquisition, which justifies short, frequent exposure over long
  sessions.
- **EV** Novice progression guidance: start at moderate loads with a small number
  of sets, establish technique, and add load only when the top of the rep range is
  exceeded on all sets, in modest steps (R1, R2).
- **EV** Proximity to failure governs fatigue cost more than it governs the
  outcome (R7, R9). Staying 2–5 reps from failure for the first weeks buys
  tolerance without giving up the stimulus.

### Protocol

Each week is a *block* repeated across the three sessions. Sets are per exercise.

| Block | Primary: sets × reps @ RIR | Accessory: sets × reps @ RIR | Weekly sets/muscle | Advance when |
| --- | --- | --- | --- | --- |
| W1 | 2 × 10 @ 4–5 | 2 × 12 @ 4 | 4–6 | gate passes |
| W2 | 3 × 10 @ 3–4 | 2 × 12 @ 3 | 6–9 | gate passes |
| W3 | 3 × 8–10 @ 2–3 | 3 × 10–12 @ 2–3 | 9–12 | gate passes |
| W4 | 4 × 8 @ 2 | 3 × 10 @ 2 | 12–14 | gate passes → normal phase |
| Hold | repeat the last passed block | repeat | unchanged | cap or owner review |

**Load per block:** W1 establishes a working weight by conservative estimate
(`docs/progression-engine.md` §5) and never adds load inside the block. From W2
on, the load increases by one increment only if the previous block's gate passed.

### The gate (FR-4.4)

A block is one week, repeated across that week's three sessions. It passes only
when **all** of the following hold **within that week**:

1. Every prescribed set was completed with at least the bottom-of-range reps.
2. No set was reported harder than the block's target effort. The four-button
   scale is compared as buckets, never as RIR numbers:

   | Block | Target RIR | Answers that satisfy criterion 2 |
   | --- | --- | --- |
   | 1 | 4–5 | `fácil` |
   | 2 | 3–4 | `fácil` |
   | 3 | 2–3 | `fácil`, `correcto` |
   | 4 | 2 | `fácil`, `correcto` |

   `duro` and `fallo` fail every block. An unanswered effort fails criterion 2
   until it is answered from the summary (FR-7.4); nothing is guessed.
3. No `molestia` or `dolor` reported on any set of any session in the block.
4. At least 2 of the 3 scheduled sessions were performed.

**DD** Why buckets, not RIR: four buttons are the finest scale a mid-set tap can
support (D-2), and `fácil` means "≥3 RIR", so a 3-RIR set is accepted in blocks
1–2 even though the target floors are 4 and 3. That tolerance is deliberate: the
alternative — an unenforceable gate or a fifth button — is worse. Because `duro`
and `fallo` never pass, the over-reaching risk the criterion exists to catch is
still caught.

**DD** Rationale: the four conditions map one-to-one onto the four risks of a
returning trainee — under-dosing, over-reaching, injury, and non-adherence. A
calendar-only exit would advance a user who has not adapted, and the brief
explicitly forbids that ("No debe obligar a pasar a la fase normal al cumplirse
cuatro semanas").

**DD** Hard cap: eight weeks. At the cap the app holds the last passed block and
asks the owner to review, because an unbounded phase would hide a genuine
problem — a load that is too high, an exercise that hurts, or life getting in the
way — behind an endlessly repeating week. The cap forbids a ninth week; it does
not cancel an exit that block 4 earns in week 8.

**DD** A block that fails twice does not advance; it drops one increment on the
primary lift and repeats. Repeated failure is data about the load, not about the
user's discipline.

---

## 7. Rest intervals

- **EV** Longer rest intervals favour strength expression and volume completion;
  short rests are viable for hypertrophy when the load is light, at a higher
  fatigue cost (R8, R1).
- **DD** Defaults: primary lift 180 s, accessory compound 120 s, isolation 90 s.
  These are per-exercise editable. Chosen so that the prescribed volume can be
  completed at the prescribed effort; the timer exists to protect that, not to
  serve a preference for short sessions.

---

## 8. Progression rules (normal phase)

Double progression with an effort gate (R13, R1). In order:

1. **Increase load** when, at the current weight, every prescribed set reached the
   top of the rep range, no discomfort was reported, and the last set was at 1 RIR
   or harder (i.e. the work was genuinely near failure). Step: one configured
   increment for that exercise (`docs/progression-engine.md` §6).
2. **Add repetitions** when every set is inside the range but not at the top.
   Weight stays; the target moves up by one rep, capped at the top of the range.
3. **Hold** when a set fell below the bottom of the range for the first time at
   this weight.
4. **Reduce one increment** when the same weight produced a below-range set twice
   consecutively. The reduction is presented as a recommendation and needs the
   user's acceptance, like every other load change.
5. **Never interpret a voluntary load reduction as failure.** If the user lowers
   the weight mid-session, the lowered weight becomes the working baseline for the
   next recommendation, and the delta is stored for history (FR-5.3, FR-5.6).
6. **Discomfort suspends progression.** Any reported `molestia` holds the load;
   `dolor` recommends a reduction and surfaces a prompt to change or stop the
   exercise. Neither state is a diagnosis.

**DD** Increments are per exercise and per equipment, not a global 2.5 kg:
barbell 2.5 kg (lower body) / 2.5 kg (upper body), dumbbell 2 × 1 kg or 2 × 2 kg
depending on the rack, machine per plate stack, cable 2.5 kg, bodyweight 0 with
rep progression only. A universal step would make upper-body progression
impossible in a small gym and lower-body progression glacial.

---

## 9. Recovery and concurrent training

- **EV** Concurrent endurance and strength training can interfere with strength
  and hypertrophy gains, mainly when endurance volume and frequency are high and
  the modalities compete for the same session (R12). The interference is a
  modulation, not a switch.
- **UP** The owner trains intense cardio on Thursday with strength on Monday,
  Wednesday and Friday. That is one separation day either side — a reasonable
  arrangement per the same evidence.
- **DD** Recovery signals (cardio load, resting heart rate, sleep, step count) are
  **never** inputs to the load calculation. They produce, at most, one explained
  advisory line on the training screen, for example: "Sesión intensa de cardio
  ayer y pulso en reposo elevado 8 lpm sobre tu media de 14 días. Puedes entrenar;
  si la primera serie se siente dura, mantén el peso." Reasons:
  1. The brief forbids automatic load changes from cardio (FR-13.3).
  2. Heart-rate and sleep data are noisy, individually variable, and cannot carry
     a deterministic decision without pretending to a precision the evidence does
     not have.
  3. A deterministic engine whose output changes with an unmeasured input is no
     longer deterministic or testable.

---

## 10. Adjusting loads — consolidated decision table

This is the authoritative order of rules; `docs/progression-engine.md` implements
it and must not deviate without editing this table.

| Order | Condition | Action | Label |
| --- | --- | --- | --- |
| 1 | No usable history for the exercise | Conservative start, low confidence, target bottom of range | DD |
| 2 | Any reported `dolor` | Recommend one increment down; prompt exercise change | DD |
| 3 | Any reported `molestia` | Hold load, hold reps; no increase | DD |
| 4 | Below-range set, second consecutive occurrence at this weight | Recommend one increment down | DD |
| 5 | Below-range set, first occurrence | Hold load and reps | EV (R13) |
| 6 | Top of range on all sets, no discomfort, last set ≤1 RIR | Increase one increment, reset target to bottom of range | EV (R13, R1) |
| 7 | In range on all sets, not at top | Hold load, add one target rep | EV (R13) |
| 8 | In range, but last set at 2+ RIR (too easy) | Hold load, add one target rep, flag for review | EV (R7, R9) |
| 9 | Readaptation block gate not passed | Repeat the block | DD (§6) |

---

## 11. What this document does not claim

- It does not claim the readaptation protocol has been validated as a whole. It is
  a design decision inside an evidence frame (§6).
- It does not claim any percentage-of-1RM figure is measured for this user. No 1RM
  is tested; percentages are a display range.
- It does not claim sleep or heart-rate data predict today's performance.
- It does not recommend training through pain, and it is not a medical opinion.
- It does not claim that 3 sessions per week is superior to 2 or 4.

---

## 12. Bibliography

All records verified 2026-11-08 via Crossref. Year = first-issued year as returned
by Crossref. Format: ID — citation — DOI — what it supports in this document.

| ID | Reference | DOI | Supports |
| --- | --- | --- | --- |
| R1 | ACSM Position Stand. *Progression Models in Resistance Training for Healthy Adults.* Med Sci Sports Exerc. 2009. | `10.1249/MSS.0b013e3181915670` | §3 P-1, P-2; §5 rep ranges; §6 novice progression; §7 rest; §8 load progression |
| R2 | ACSM Position Stand. *Progression Models in Resistance Training for Healthy Adults.* Med Sci Sports Exerc. 2002. | `10.1097/00005768-200202000-00027` | Predecessor of R1; specificity and overload principles |
| R3 | Zourdos MC, et al. *Novel Resistance Training-Specific Rating of Perceived Exertion Scale Measuring Repetitions in Reserve.* J Strength Cond Res. 2016. | `10.1519/JSC.0000000000001049` | §5 RIR validity; FR-7.2 effort vocabulary |
| R4 | Schoenfeld BJ, Ogborn D, Krieger JW. *Dose-response relationship between weekly resistance training volume and increases in muscle mass.* J Sports Sci. 2016. | `10.1080/02640414.2016.1210197` | §2.2; §4 volume targets |
| R5 | Schoenfeld BJ, Grgic J, Krieger J. *Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis.* Sports Med. 2016. | `10.1007/s40279-016-0543-8` | §2.4; frequency as distribution |
| R6 | Schoenfeld BJ, et al. *Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training.* J Strength Cond Res. 2017. | `10.1519/JSC.0000000000002200` | §2.1, §2.3; §5 load–rep equivalence |
| R7 | Helms ER, et al. *RPE and Velocity Relationships for the Back Squat, Bench Press, and Deadlift in Powerlifters.* J Strength Cond Res. 2016. | `10.1519/JSC.0000000000001517` | §2.1, §3 P-3; §5 effort gating; §10 rule 8 |
| R8 | Grgic J, et al. *Effects of Rest Interval Duration in Resistance Training on Measures of Muscular Strength: A Systematic Review.* Sports Med. 2017. | `10.1007/s40279-017-0788-x` | §7 rest intervals |
| R9 | Refalo MC, et al. *Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis.* Sports Med. 2022. | `10.1007/s40279-022-01784-y` | §5 failure not required; §6 fatigue management; §10 rule 8 |
| R10 | Mujika I, Padilla S. *Detraining: Loss of Training-Induced Physiological and Performance Adaptations. Part I.* Sports Med. 2000. | `10.2165/00007256-200030020-00002` | §6 detraining rate and dependence on training status |
| R11 | Ogasawara R, et al. *Comparison of muscle hypertrophy following 6-month of continuous and periodic strength training.* Eur J Appl Physiol. 2012. | `10.1007/s00421-012-2511-9` | §6 retained capacity after interruptions |
| R12 | Wilson JM, et al. *Concurrent Training: A Meta-Analysis Examining Interference of Aerobic and Resistance Exercises.* J Strength Cond Res. 2012. | `10.1519/JSC.0b013e31823a3e2d` | §9 interference modulation |
| R13 | Plotkin D, et al. *Progressive overload without progressing load? The effects of load or repetition progression on muscular adaptations.* PeerJ. 2022. | `10.7717/peerj.14142` | §2.3; §8 double progression; §10 rules 5–7 |
| R14 | Ardern CL, et al. *2016 Consensus statement on return to sport from the First World Congress in Sports Physical Therapy, Bern.* Br J Sports Med. 2016. | `10.1136/bjsports-2016-096278` | §6 graduated return framing (conceptual, not strength-specific) |

This table is the single numbering authority: in-text IDs refer to it, and where a
claim cites two IDs, both must hold. R14 (return-to-sport consensus) is cited only
in §6 as a conceptual frame; it is not a strength-training source and is never
used to justify a load number.

### Deliberate omissions

Sources consulted in spirit but not cited because a specific claim could not be
checked against the record: 1RM prediction formulas (varying error, no single
authority), sleep-extension and strength trials (small, heterogeneous), and
wearable-derived recovery scores (no verifiable deterministic basis). They are
absent by choice, not by oversight.
