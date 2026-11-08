import Foundation

extension ProgressionEngine {
    /// The gate of `training-science.md` §6, corrected at G1: a block is one week
    /// and its criteria are compared as effort buckets, not as RIR numbers.
    ///
    /// Signature note: the document wrote `evaluateBlock(phase:state:history:)`,
    /// but criteria 1 and 2 need the prescription's rep floor and the block's
    /// allowed effort. They are passed through `input` instead of being guessed.
    public func evaluateBlock(_ input: ProgressionInput) -> BlockDecision {
        let state = input.phaseState
        let block = ReadaptationBlock.at(state.passedBlocks + 1, role: state.role)
        let bottom = input.prescription.repRange.lowerBound
        var unmet: Set<BlockCriterion> = []

        if input.history.isEmpty {
            unmet.insert(.setsNotCompleted)
            unmet.insert(.effortHarderThanTarget)
        }

        for outcome in input.history {
            if outcome.sets.count < block.sets
                || outcome.sets.contains(where: { $0.actualReps < bottom }) {
                unmet.insert(.setsNotCompleted)
            }
            for set in outcome.sets {
                if set.effort.map({ block.allowedEffort.contains($0) }) != true {
                    unmet.insert(.effortHarderThanTarget)
                }
                if set.discomfort == Discomfort.mild || set.discomfort == Discomfort.pain {
                    unmet.insert(.discomfortReported)
                }
            }
        }

        if state.performedSessions < min(2, state.scheduledSessions) {
            unmet.insert(.sessionsMissed)
        }

        if unmet.isEmpty {
            let kind: BlockDecision.Kind = block.index >= 4 ? .advanceToNormal : .pass
            return .init(kind: kind, block: block.index, unmetCriteria: [], shouldDropIncrement: false)
        }
        if state.week >= 8 {
            return .init(kind: .capReached, block: block.index,
                         unmetCriteria: unmet,
                         shouldDropIncrement: state.consecutiveFailures >= 1)
        }
        return .init(kind: .repeatBlock, block: block.index,
                     unmetCriteria: unmet,
                     shouldDropIncrement: state.consecutiveFailures >= 1)
    }

    func readaptation(
        _ input: ProgressionInput,
        last: ExerciseOutcome,
        confidence: Confidence,
        now: Date
    ) -> ProgressionRecommendation {
        let decision = evaluateBlock(input)
        let state = input.phaseState
        let increment = input.exercise.loadIncrementKg

        let blockIndex: Int
        switch decision.kind {
        case .pass: blockIndex = min(decision.block + 1, 4)
        case .repeatBlock, .capReached, .advanceToNormal: blockIndex = decision.block
        }
        let block = ReadaptationBlock.at(blockIndex, role: state.role)
        let reps = min(
            max(block.repRange.lowerBound, input.prescription.repRange.lowerBound),
            input.prescription.repRange.upperBound
        )

        var weight = last.weightKg
        var action: ProgressionAction = .hold
        var reason: ReasonCode

        switch decision.kind {
        case .pass, .advanceToNormal:
            reason = .readaptationBlockPassed
            // The caller advances `blockBaselineKg` when it applies a passed gate;
            // only then is the one-increment step between blocks visible here.
            if let baseline = state.blockBaselineKg, baseline > last.weightKg + LoadRounding.epsilon {
                weight = baseline
                action = .increase
            }
        case .capReached:
            reason = .readaptationCapReached
        case .repeatBlock:
            reason = .readaptationBlockNotPassed
        }

        if decision.shouldDropIncrement {
            weight = max(last.weightKg - increment, increment)
            action = .decrease
            reason = .readaptationBlockNotPassed
        }

        return ProgressionRecommendation(
            suggestedWeightKg: weight,
            suggestedSets: block.sets,
            suggestedTargetReps: reps,
            action: action,
            reason: reason,
            confidence: confidence,
            basedOnSessions: input.history.filter { !$0.sets.isEmpty }.count,
            computedAt: now
        )
    }
}
