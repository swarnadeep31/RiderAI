import { ACTIVITIES } from '../lib/activities.js';
import Icon, { ACTIVITY_STYLE } from './art/Icon.jsx';

export default function ActivityBadge({ activity, className = '' }) {
  const style = ACTIVITY_STYLE[activity] ?? ACTIVITY_STYLE.other;
  return (
    <span className={`badge ${style.badge} ${className}`}>
      <Icon name={style.icon} className="h-3.5 w-3.5" strokeWidth={2.2} />
      {ACTIVITIES[activity] ?? ACTIVITIES.other}
    </span>
  );
}
