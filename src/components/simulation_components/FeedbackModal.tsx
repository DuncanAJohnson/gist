import { useState } from 'react';
import { createSimulationFeedback } from '../../lib/simulationService';

interface FeedbackModalProps {
  simulationId: number;
  onClose: () => void;
}

function FeedbackModal({ simulationId, onClose }: FeedbackModalProps) {
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!feedbackText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createSimulationFeedback(simulationId, feedbackText.trim());
      setSubmitted(true);
      setFeedbackText('');
      // Auto-close after showing success
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 min-w-[350px] max-w-[400px]">
      {submitted ? (
        <div className="p-4 text-center">
          <div className="text-green-600 text-lg font-medium mb-2">✓ Thanks for your feedback!</div>
          <p className="text-gray-600 text-sm">Your feedback helps us improve.</p>
        </div>
      ) : (
        <>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            Provide Feedback
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            How was this AI-generated simulation? Let us know what worked or what could be improved.
          </p>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Share your thoughts on this simulation..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
            rows={4}
            disabled={isSubmitting}
          />
          <button
            onClick={handleSubmit}
            disabled={!feedbackText.trim() || isSubmitting}
            className="mt-3 w-full px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </>
      )}
    </div>
  );
}

export default FeedbackModal;

