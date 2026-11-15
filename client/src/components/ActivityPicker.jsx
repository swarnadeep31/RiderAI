import { ACTIVITIES } from '../lib/activities.js';
import Icon, { ACTIVITY_STYLE } from './art/Icon.jsx';

// Ride, hike, climb...: one big choice each, with its picture.
export default function ActivityPicker({ value, onChange }) {
  return (
    <fieldset>
      <legend className="field-label">Activity</legend>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Object.entries(ACTIVITIES).map(([activity, label]) => (
          <label key={activity} className="cursor-pointer">
            <input
              type="radio"
              name="activity"
              value={activity}
              checked={value === activity}
              onChange={(event) => onChange(event.target.value)}
              className="peer sr-only"
            />
            <span className="flex h-full flex-col items-center gap-1.5 rounded-[3px] bg-paper px-2 py-3 text-center text-small font-semibold text-ink-soft ring-[1.5px] ring-ink/20 transition-colors hover:text-ink hover:ring-ink/50 peer-checked:bg-ink peer-checked:text-paper peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-water">
              <Icon name={ACTIVITY_STYLE[activity].icon} className="h-7 w-7" />
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
