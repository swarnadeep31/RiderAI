import { ACTIVITIES } from '../lib/activities.js';
import Icon, { ACTIVITY_STYLE } from './art/Icon.jsx';

// What kind of trip: a small printed tag.
export default function ActivityBadge({ activity, className = 'bg-surface text-ink' }) {
  const style = ACTIVITY_STYLE[activity] ?? ACTIVITY_STYLE.other;
  return (
    <span className={`tag ${className}`}>
      <Icon name={style.icon} className="h-4 w-4" strokeWidth={2} />
      {ACTIVITIES[activity] ?? ACTIVITIES.other}
    </span>
  );
}
