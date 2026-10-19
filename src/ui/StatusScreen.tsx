import { Button } from './controls';
import { Icon } from './icons';

export function StatusScreen({
  title,
  message,
  loading,
  onRetry,
  onContinue,
  diagnostics,
}: {
  title: string;
  message?: string;
  loading?: boolean;
  onRetry?: () => void;
  onContinue?: () => void;
  diagnostics?: string[];
}) {
  return (
    <div className="rv-status" role={loading ? 'status' : 'alert'} aria-live="polite">
      <div className="rv-status__card">
        {loading ? <span className="rv-spinner" aria-hidden="true" /> : <Icon name="alert" size={28} />}
        <h1>{title}</h1>
        {message && <p>{message}</p>}
        {(onRetry || onContinue) && (
          <div className="rv-row rv-row--center">
            {onRetry && (
              <Button variant="primary" icon="rotate" onClick={onRetry}>
                Try again
              </Button>
            )}
            {onContinue && <Button onClick={onContinue}>Continue with my own photos</Button>}
          </div>
        )}
        {diagnostics && diagnostics.length > 0 && (
          <details className="rv-diag">
            <summary>Details for the site owner</summary>
            <ul>
              {diagnostics.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
