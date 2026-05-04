import RightIconRectInput from "./atoms/RightIconRectInput";
import IconButton from "./atoms/IconButton";
import "./Form.css";

function Form({ title, children, onSubmit }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <div>
        <div className="form__title">{title}</div>
        <div style={{marginTop: "20px"}}></div>
        <div className="h-divider"></div>
      </div>
      <div className="form__content">{children}</div>
    </form>

  );
}

export default Form;
