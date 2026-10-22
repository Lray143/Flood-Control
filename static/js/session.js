// ── Multi-User Session Isolation ─────────────────────────────────────
        (function() {
            let sid = localStorage.getItem('flood_sim_session_id');
            if (!sid) {
                sid = 's_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
                localStorage.setItem('flood_sim_session_id', sid);
            }
            document.cookie = 'session_id=' + sid + '; path=/; max-age=604800; SameSite=Lax';

            const _baseFetch = window.fetch;
            window.fetch = function(url, options) {
                options = options || {};
                options.headers = options.headers || {};
                if (options.headers instanceof Headers) {
                    if (!options.headers.has('X-Session-ID')) options.headers.set('X-Session-ID', sid);
                } else {
                    if (!options.headers['X-Session-ID']) options.headers['X-Session-ID'] = sid;
                }
                return _baseFetch.call(this, url, options);
            };
        })();
