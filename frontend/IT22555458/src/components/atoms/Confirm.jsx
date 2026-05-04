import React from "react";

import IconButton from "./IconButton";

import "./Confirm.css";

function Confirm({ title, message, onOK, onCancel }) {
    return (
        <div className="confirm-container">
            <div className="confirm">
                <div className="confirm__message-container">
                    <div className="confirm__message-icon material-icon">warning</div>
                    <div className="confirm__message-content">
                        <div className="confirm__message-title">{title}</div>
                        <div className="confirm__message-text">{message}</div>
                    </div>
                </div>
                <div className="confirm__actions">
                    <IconButton onClick={onOK} iconb={"check"} h={30} bg="green" c="white" content={"OK"} />
                    <IconButton onClick={onCancel} iconb={"close"} h={30} bg="red" c="white" content={"Cancel"} />
                </div>
            </div>
        </div>
    );
};

export default Confirm;
