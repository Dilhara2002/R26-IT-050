import { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from 'react-router-dom';
import { toast } from "react-toastify";
import axios from '../utils/axios';

import { UserContext } from "../contexts/UserContext";

import RightIconRectInput from "./atoms/RightIconRectInput";
import IconButton from "./atoms/IconButton";

import { ReactComponent as GoogleIcon } from '../assets/images/google-icon.svg';

import "./LoginForm.css";

function decodeToken(token) {
    try {
        const payload = token.split('.')[1];
        const decodedPayload = atob(payload);
        console.log("Decoded Payload:", decodedPayload);
        return JSON.parse(JSON.stringify(decodedPayload));
    } catch (error) {
        console.error("Failed to decode token:", error);
        return null;
    }
}

function LoginForm({ isSuccess = false }) {

    const navigate = useNavigate();

    const [userId, setUserId] = useState("");
    const [password, setPassword] = useState("");

    const { userContext, setUserContext } = useContext(UserContext)

    const googleAuth = (event) => {
        event.preventDefault();
        window.location.href = `${process.env.REACT_APP_BACKEND_URL}/auth/google`;
    }

    useEffect(() => {
        const queryParams = new URLSearchParams(window.location.search);
        const token = queryParams.get('token');
        if (token && isSuccess) {
            localStorage.setItem('token', token);
            localStorage.setItem('user', decodeToken(token));
            setUserContext(decodeToken(token));
            // axios.get("/auth/user").then((res) => {
            //     if (res.data?.status === "success") {
            //         setUserContext(res.data.user);
            //         localStorage.setItem('user', JSON.stringify(res.data.user));
            //         toast.success("Logged In Successfully");
            //         navigate(`/chat`);
            //     } else {
            //         toast.error(res.data?.message);
            //     }
            // }).catch((err) => {
            //     console.error(err);
            //     if (err.response?.data.message) {
            //         toast.error(err.response.data.message);
            //     }
            // }
            toast.success("Logged In Successfully");
            navigate(`/feed`);
        }
    }, [navigate, setUserContext]);

    const login = (event) => {
        event.preventDefault();

        if (userId === "" || password === "") {
            toast.error("Please fill all the fields");
            return;
        }

        axios.post("/auth/login", { staffLoginId: userId, password: password }).then((res) => {
            if (res.data?.status == "success") {
                localStorage.setItem('token', res.data.accessToken);
                setUserContext(res.data.user);
                localStorage.setItem('user', JSON.stringify(res.data.user));

                toast.success("Logged In Successfully");

                navigate(`/`);
            } else {
                toast.error(res.data?.message);
            }

        }).catch((err) => {
            console.log(err);
            if (err.response?.data.message) {
                toast.error(err.response.data.message);
            } else {
                toast.error(err.message);
            }
        });
    }

    return (
        <>
            <form onSubmit={login} className="login-form form auth-form">
                <div className="form-title">Login</div>
                <div className="h-divider"></div>
                <RightIconRectInput onChange={(e) => setUserId(e.target.value)} type="text" placeholder="ABCD@NLMS" icon="person" inputLabel="User ID" />
                <RightIconRectInput onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Enter atleast 8 characters" icon="lock"
                    inputLabel={
                        <div className="password__label">
                            <span>Password</span>
                            <Link to="/auth/forgot-password">Forgot Password?</Link>
                        </div>
                    }
                />

                <IconButton iconb="login" content={"Login"} bg="green" c="white" extraClass={"btn-margin login-btn"} type="submit" />
                <IconButton icon="google" onClick={googleAuth} iconb={<GoogleIcon />} w="max" extraClass="google-auth-btn btn-margin" content={"Continue with Google"} />
            </form>
            <div className="form-bottom-bar">
                <div>T&C</div>
                <div>Help</div>
            </div>
        </>
    );
}

export default LoginForm;