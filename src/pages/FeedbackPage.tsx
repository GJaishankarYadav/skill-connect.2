import { useEffect, useState, type FormEvent } from 'react';
import { useFirebase } from '../context/FirebaseContext';
import {
  BLUEPRINT_LIMITS,
  type FeedbackRecord,
  type Workshop
} from '../types';

export function FeedbackPage() {
  const { user, profile, signInWithGoogle, authFetch } = useFirebase();
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [feedbackList, setFeedbackList] = useState<FeedbackRecord[]>([]);
  const [workshopId, setWorkshopId] = useState('');
  const [rating, setRating] = useState(5);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [wRes, fRes] = await Promise.all([
        fetch('/api/workshops'),
        fetch('/api/feedback')
      ]);
      if (wRes.ok) {
        const wData = (await wRes.json()) as { workshops: Workshop[] };
        setWorkshops(wData.workshops);
        if (!workshopId && wData.workshops.length > 0) {
          setWorkshopId(String(wData.workshops[0].id));
        }
      }
      if (fRes.ok) {
        const fData = (await fRes.json()) as { feedback: FeedbackRecord[] };
        setFeedbackList(fData.feedback);
      }
    } catch {
      setErrorMsg('Unable to load feedback right now.');
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSuccessMsg(null);
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await authFetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          workshopId: Number.parseInt(workshopId, 10),
          rating,
          comments: comments.trim()
        })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not save feedback.');
        return;
      }

      setComments('');
      setSuccessMsg('Thank you! Your feedback has been saved.');
      await loadData();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to submit feedback.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="section">
      <div className="container split">
        <div className="form-card">
          <h1>Share feedback</h1>
          {!user ? (
            <>
              <p className="muted">
                Sign in with Google to submit a rating and review for a
                SkillConnect workshop.
              </p>
              <button
                type="button"
                className="btn primary"
                onClick={() => void signInWithGoogle()}
              >
                Sign in with Google
              </button>
            </>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)}>
              {successMsg && <div className="alert success">{successMsg}</div>}
              {errorMsg && <div className="alert error">{errorMsg}</div>}
              <label>
                Participant
                <input
                  value={profile?.fullName || user.displayName || user.email || ''}
                  disabled
                />
              </label>
              <label>
                Workshop
                <select
                  value={workshopId}
                  onChange={(e) => setWorkshopId(e.target.value)}
                  required
                >
                  {workshops.map((w) => (
                    <option key={w.id} value={String(w.id)}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rating
                <select
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                >
                  <option value={5}>★★★★★ Excellent</option>
                  <option value={4}>★★★★☆ Very good</option>
                  <option value={3}>★★★☆☆ Good</option>
                  <option value={2}>★★☆☆☆ Fair</option>
                  <option value={1}>★☆☆☆☆ Poor</option>
                </select>
              </label>
              <label>
                Comments
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.commentsMax}
                  placeholder="Share what you learned or how we can improve..."
                />
              </label>
              <button
                type="submit"
                className="btn primary full"
                disabled={submitting || workshops.length === 0}
              >
                {submitting ? 'Submitting...' : 'Submit feedback'}
              </button>
            </form>
          )}
        </div>

        <div>
          <h2>Recent feedback</h2>
          {feedbackList.length > 0 ? (
            feedbackList.map((f) => (
              <div key={f.id} className="feedback">
                <strong>{f.authorName}</strong>
                <span>{'★'.repeat(f.rating)}</span>
                <p>{f.comments || 'Rated without comment.'}</p>
                <small>{f.workshopName}</small>
              </div>
            ))
          ) : (
            <p className="muted">No feedback yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
