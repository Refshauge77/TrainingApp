import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';

export default function Header({ title, subtitle, back, actions }) {
  const navigate = useNavigate();
  return (
    <header className="header">
      {back && (
        <button className="icon-btn" aria-label="Tilbage"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(back))}>
          <Icon name="back" />
        </button>
      )}
      <div className="header-title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}
