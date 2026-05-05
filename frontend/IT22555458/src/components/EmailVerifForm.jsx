import { useEffect, useState} from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";

import {toast} from "react-toastify";

import axios from "../../utils/axios"

import RightIconRectInput from "../atoms/RightIconRectInput";
import IconButton from "../atoms/IconButton";

import "../../css/login-form.css"
import "../../css/verif-form.css"

import { ReactComponent as GoogleIcon } from '../../images/google-icon.svg';
import VerifTextArea from "./VerifTextArea";

function VerifForm({attrib}) {
    const location = useLocation();
    const navigate = useNavigate();

    const params = new URLSearchParams(location.search);
    const {id} = useParams()

    const [otp, setOTP] = useState("");

    useEffect(() => {
        if(location.state){
            if(location.state.state == 'success'){
                toast.info("An email has been sent to your email address. Please verify your email address to continue.")
            }
        }

        const otpg = params.get('otp');

        if(id && otp){
            console.log(id, otp);
            setOTP(otpg)
            verifyOTP();
        }

    }, []);

    const verifyOTP = () =>{
        axios.patch(`/auth/verify/${id}`, {otp: otp}).then((res) => {
            if (res.data?.status == "success") {
                toast.success(res.data?.message);
                navigate(`/user/profile/${id}`, { state: { state:"success", message: "Email Verification Successfull" } });
            }
            else if (res.data?.status == "error") {
                toast.error(res.data?.message);
            }
        }).catch((err) => {
            console.log(err)
            if(err.response && err.response.data.message){
                toast.error(err.response.data.message);
            }else{
                toast.error(err.message);
            }
        });
    }

    const handleSubmit = (e) => {
        e.preventDefault();
        if(otp?.length < 5){
            toast.error("OTP is not valid")
        }else{
            verifyOTP();
        }
    }

    useEffect(()=>{
        console.log(otp);
    },[otp])

    return (
        <>
            <form onSubmit={handleSubmit} className="verify-form form auth-form">
            <div className="form-title">Verify {attrib}</div>
                <div className="verify-icon">
                    {
                    attrib.toLowerCase() == 'email' ? "mail" : 
                    (attrib.toLowerCase() == 'phone' ? "phone": 
                    "")
                    }
                </div>
                <div className="verify-text">
                    <p>We have sent a verification code to your {attrib.toLowerCase()}. Please enter the code below to verify your account.</p>
                </div>
                <VerifTextArea  setOTP={setOTP}/>
                <IconButton content={"Verify"} extraClass={"btn-borderw-1 btn-borderc-747775 btn-margin login-btn"} />
            </form>
            <div className="form-bottom-bar">
                <div>T&C</div>
                <div>Help</div>
                <div className="register-link"><span>Register</span><span className="register__icon">arrow_forward</span></div>
            </div>
        </>
    );
}

export default VerifForm;