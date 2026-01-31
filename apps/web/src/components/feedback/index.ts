/**
 * Feedback System Components
 *
 * See FEEDBACK-COLLECTION-PLAN.md
 */

// Core provider and hooks
export { FeedbackProvider, useFeedback, useFeedbackSafe } from './FeedbackProvider';

// Phase 1: User-initiated feedback
export { FeedbackTab } from './FeedbackTab';

// Phase 2: Contextual feedback
export { InlineRating } from './InlineRating';
export { MicroSurvey } from './MicroSurvey';
export { EmojiScale, DEFAULT_EMOJIS, type EmojiValue } from './EmojiScale';

// Phase 3: Passive signals
export { FeedbackErrorBoundary } from './FeedbackErrorBoundary';
export {
  ImplicitSignalTracker,
  ArticleSignalTracker,
  FeatureSignalTracker,
} from './ImplicitSignalTracker';

// Phase 4: Relationship metrics
export { NPSSurvey } from './NPSSurvey';
export { CSATSurvey } from './CSATSurvey';

// Phase 5: Integration
export { BuildFeedbackIntegration } from './BuildFeedbackIntegration';
