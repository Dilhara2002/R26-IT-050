import React from 'react'
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';

import axios from '../../src/utils/axios';

import Form from '../components/Form';
import RightIconRectInput from '../components/atoms/RightIconRectInput';
import IconBottun from './atoms/IconButton';

import "./ForgotPasswordEmail.css";


function ForgotPasswordEmail(onclick) {

    const [email, setEmail] = useState("");

    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            const response = await axios.post("/auth/forgot-password", { email }, {
                headers: { "Content-Type": "application/json" },
            });

            navigate("/auth/forgot-password/otp");
            setEmail("");
            toast.success("Email sent successfully");
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

            <Form className="create" onSubmit={handleSubmit} title="Forgot Password">
                <div className="form-message">
                    <span className="form-message__icon material-symbols-outlined bold">
                        email
                    </span>
                    <p>Enter your email address below and we will send you a OTP to reset your password.</p>
                </div>
                <RightIconRectInput
                    type="email"
                    onChange={(e) => setEmail(e.target.value)}
                    value={email}
                    inputLabel="Enter Your Email:"
                />
                <br/>
                <div className="horizontal-container"><IconBottun type="submit" w="60" content={"Send Email"} /></div>
            </Form>
        </>
    )
}

export default ForgotPasswordEmail
