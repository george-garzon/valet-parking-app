"""Exercise the production Next.js API with isolated SQLite storage."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def run():
    with tempfile.TemporaryDirectory(prefix='porter-test-') as storage:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        environment = dict(os.environ, VALET_STORAGE=storage, BUSINESS_ID='workflow-test',
                           BUSINESS_NAME='Test Harbor Inn', APP_BRAND_NAME='Test Valet',
                           BUSINESS_TYPE='hotel',
                           SMS_PROVIDER='preview', PUBLIC_APP_URL=base,
                           RATE_TRANSIENT_CENTS='3100', TWILIO_AUTH_TOKEN='secret-test-only')
        server = None

        def request(action, payload=None, suffix=''):
            req = urllib.request.Request(
                f'{base}/api?action={action}{suffix}',
                data=json.dumps(payload).encode() if payload is not None else None,
                headers={'Content-Type': 'application/json'},
            )
            try:
                with urllib.request.urlopen(req, timeout=3) as response:
                    return response.status, json.load(response)
            except urllib.error.HTTPError as error:
                return error.code, json.load(error)

        def start():
            process = subprocess.Popen(
                ['node', 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', str(port)],
                cwd=ROOT, env=environment, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            for _ in range(200):
                try:
                    request('list')
                    return process
                except (OSError, urllib.error.URLError):
                    time.sleep(0.05)
            process.terminate()
            process.wait()
            raise RuntimeError('Next.js server failed to start. Run npm run build first.')

        try:
            server = start()
            assert request('list') == (200, [])
            assert request('create', {})[0] == 422
            assert request('create', [])[0] == 400
            data = dict(guest='Alex Test', phone='555-0100', make='BMW', model='X5',
                        color='Black', plate='test 123', space='B-04', key_tag='K-3',
                        type='Transient', notes='Existing scratch', attendant='Jamie', room_number='320')
            status, ticket = request('create', data)
            assert status == 201 and ticket['plate'] == 'TEST 123'
            assert ticket['status'] == 'parked' and ticket['rate'] == 3100
            assert ticket['notification']['status'] == 'preview'
            assert 'Test Harbor Inn' in ticket['notification']['body']
            assert f"{base}/?ticket={ticket['token']}" in ticket['notification']['body']
            with urllib.request.urlopen(base) as response:
                html = response.read().decode()
                assert 'Test Harbor Inn' in html and 'secret-test-only' not in html
            assert len(ticket['token']) == 48
            assert request('create', data)[0] == 409
            assert request('status', {'id': [], 'status': 'requested'})[0] == 422
            status, public = request('guest', suffix=f"&token={ticket['token']}")
            assert status == 200 and public['guest'] == 'Alex Test'
            assert public['room_number'] == '320'
            assert not {'phone', 'notes', 'key_tag', 'space', 'attendant', 'notification'} & public.keys()
            assert request('guest', suffix='&token=invalid')[0] == 404
            assert request('request', {'token': 'invalid'})[0] == 404
            assert request('status', {'id': ticket['id'], 'status': 'completed'})[0] == 409
            assert request('request', {'token': ticket['token']})[0] == 200
            assert request('request', {'token': ticket['token']})[0] == 409
            for next_status in ['retrieving', 'ready', 'completed']:
                assert request('status', {'id': ticket['id'], 'status': next_status})[0] == 200
                assert request('guest', suffix=f"&token={ticket['token']}")[1]['status'] == next_status
            assert request('request', {'token': ticket['token']})[0] == 409
            assert request('create', data)[0] == 201  # A returning vehicle gets a new ticket.
            assert len(request('list')[1]) == 2
            server.terminate()
            server.wait()
            server = start()
            records = request('list')[1]
            assert len(records) == 2
            assert records[1]['completed_at'] and records[1]['requested_at']
            assert records[1]['room_number'] == '320'
            # Next.js never exposes private storage files.
            try:
                urllib.request.urlopen(f'{base}/storage/valet.sqlite')
                raise AssertionError('Storage route should not be public')
            except urllib.error.HTTPError as error:
                assert error.code == 404
            print('PASS: creation, validation, guest privacy, duplicate plates, retrieval, persistence, storage isolation')
        finally:
            if server is not None:
                server.terminate()
                server.wait()


if __name__ == '__main__':
    run()
