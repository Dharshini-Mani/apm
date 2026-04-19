document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-msg');

    try {
        const apiUrl = window.location.protocol === 'file:' ? 'http://localhost:3001/api/login' : '/api/login';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            localStorage.setItem('apm_token', data.token);
            window.location.href = 'index.html';
        } else {
            errorMsg.style.display = 'block';
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Could not connect to the authentication server. Ensure the backend is running.');
    }
});

