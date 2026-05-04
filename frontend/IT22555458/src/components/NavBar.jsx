import { Link, useLocation } from "react-router-dom";
import "./NavBar.css";

function NavBar({ navLinks, version, icon, userId }) {
  const location = useLocation();
  const path = location.pathname;

  if (!version) {
    version = "0.0.0v"
  }

  if (!icon) {
    icon = ""
  }

  return (
    <div className="nav">
      <div className="nav-container">
        <div className="nav__logo-container">
          <div className="nav__logo">{icon}</div>
        </div>
        <div className="nav__name">
          <div className="nav__name-details">Skillearn</div>
          <div className="nav__name-version">{version}</div>
        </div>
      </div>
      <div className="nav__wrapper">
        <ul className="nav-links">
          {navLinks.map((link, index) => (
            <li key={`nav-main-${index}`} className={`nav-link ${link.path.indexOf(path) !== -1 ? "selected" : ""}`} title={link.title}>
              <label htmlFor={index} className="link-label">
                <span className="nav-link__main">
                  <span className="nav-link__details">
                    <span className="nav-link__icon material-symbols-outlined-fill"> {link.icon}</span>
                    <span className="nav-link__text">
                      {link.title}
                    </span>
                    <input type="checkbox" id={index} name="nav-link"></input>
                  </span>
                </span>

                <ul className="nav-links__sub">
                  {link.sub.map((subLink, subIndex) => (
                    <li key={`nav-main-${index}-sub-${subIndex}`} className={`nav-link ${subLink.path.indexOf(path) !== -1 ? "selected" : ""}`} title={subLink.title}>
                      <Link className="link" to={subLink.path[0]}>
                        <span className="nav-link__icon material-symbols-outlined-fill"> {subLink.icon}</span>
                        <span className="nav-link__text">
                          {subLink.title}
                        </span>
                      </Link>
                    </li>
                  ))
                  }
                </ul>
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="nav-container">
        <div className="nav__profile-image-container">
          <div className="nav__profile-image"></div>
        </div>
        <div className="nav__profile">
          <div className="nav__profile-details">John Doe</div>
          <Link to="/auth/logout">
            <div className="nav__logout material-symbols-outlined-fill">
              logout
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default NavBar;
