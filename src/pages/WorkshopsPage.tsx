import { useEffect, useMemo, useState } from 'react';
import { WorkshopCard } from '../components/WorkshopCard';
import type { Workshop } from '../types';

export function WorkshopsPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/workshops')
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to load workshops right now.');
        return res.json() as Promise<{ workshops: Workshop[] }>;
      })
      .then((data) => {
        if (active) {
          setWorkshops(data.workshops);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Unable to load workshops.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(workshops.map((w) => w.category))).sort(),
    [workshops]
  );

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return workshops.filter(
      (w) =>
        (!q ||
          `${w.name} ${w.description} ${w.location}`
            .toLowerCase()
            .includes(q)) &&
        (!selectedCategory || w.category === selectedCategory)
    );
  }, [workshops, searchTerm, selectedCategory]);

  return (
    <section className="section">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Community courses</span>
            <h1>Find your next skill</h1>
          </div>
        </div>

        <form className="filters" onSubmit={(e) => e.preventDefault()}>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search workshops"
          />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </form>

        {error && <div className="alert error">{error}</div>}

        {loading ? (
          <div className="empty">Loading workshops...</div>
        ) : filtered.length > 0 ? (
          <div className="workshop-grid">
            {filtered.map((w) => (
              <WorkshopCard key={w.id} workshop={w} />
            ))}
          </div>
        ) : (
          <div className="empty">No workshops found.</div>
        )}
      </div>
    </section>
  );
}
