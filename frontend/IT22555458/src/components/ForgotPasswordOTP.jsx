import React from 'react'
import axios from '../utils/axios';
import { useState } from 'react';

import Form from './Form';
import IconBottun from './atoms/IconButton';
import VerifTextArea from './VerifTextArea';
import { useParams } from 'react-router';

function ForgotPasswordotp({ sendPin }) {

    const [pin, setPin] = useState("");
    const { email } = useParams();

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            const response = await axios.post("/auth/forgot-password/otp", { pin }, {
                headers: { "Content-Type": "application/json" },
            });

            setPin("");
            console.log("Pin sent", response.data);
        } catch (error) {
            if (error.response) {
                console.log(error.response.data.error);
            } else {
                console.log("An error occurred:", error.message);
            }
        }
    };

    return (
        <>
            <Form className="create" onSubmit={handleSubmit} title="Enter the Pin">
                <div className="form-message">
                    <span className="form-message__icon material-symbols-outlined bold">
                        passkey
                    </span>
                    <p style={{ width: "350px" }}>
                        We have sent a 5-digit pin to your email address: <b style={{ background: "var(--gradient-1)", backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>
                            {email}
                        </b>
                        . Please enter the pin below to reset your password.
                    </p>
                </div>
                <VerifTextArea setOTP={setPin} /><br />
                <div className="horizontal-container"><IconBottun onClick={sendPin} w="60" content={"Send Pin"} /></div>
            </Form>
        </>
    )
}

export default ForgotPasswordotp
