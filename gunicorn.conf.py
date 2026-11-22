import os

bind = os.environ.get('GUNICORN_BIND', '0.0.0.0:5000')
workers = int(os.environ.get('WEB_CONCURRENCY', '2'))
threads = int(os.environ.get('GUNICORN_THREADS', '2'))
worker_class = 'gthread'
timeout = int(os.environ.get('GUNICORN_TIMEOUT', '120'))
keepalive = 5
accesslog = '-'
errorlog = '-'
capture_output = True
preload_app = False
