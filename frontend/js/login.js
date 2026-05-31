document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            if (res.ok && data.success && data.token) {
                localStorage.setItem('auth_token', data.token);
                localStorage.setItem('auth_username', username);
                window.location.href = '/dashboard.html';
            } else {
                alert(data.error || 'Gagal login');
            }
        } catch (err) {
            console.error(err);
            alert('Gagal menghubungi server');
        }
    });
});
