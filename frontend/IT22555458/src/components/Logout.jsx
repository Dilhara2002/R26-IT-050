import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

function Logout() {
  const navigate = useNavigate();

  useEffect(() => {
    toast.success('Logged out successfully');
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/auth');
  }, []);

  return null;
}

export default Logout;