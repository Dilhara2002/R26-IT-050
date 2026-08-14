import axios from "axios";

const API = axios.create({
  baseURL: "http://172.28.16.41:5000/api"
});

export default API;