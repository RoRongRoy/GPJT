import os
import sys
import subprocess
import re
import urllib.request
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXE_PATH = os.path.join(ROOT, 'cloudflared.exe')

def ensure_cloudflared():
    # Check PATH first
    try:
        res = subprocess.run(['cloudflared', '--version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode == 0:
            return 'cloudflared'
    except Exception:
        pass

    if os.path.exists(EXE_PATH):
        return EXE_PATH

    print('cloudflared 프로그램을 다운로드하고 있습니다...')
    print('(최초 1회 약 50MB 다운로드, 잠시만 기다려주세요)')
    url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
    urllib.request.urlretrieve(url, EXE_PATH)
    print('다운로드 완료!\n')
    return EXE_PATH

def copy_to_clipboard(text):
    try:
        proc = subprocess.Popen('clip', stdin=subprocess.PIPE, text=True, shell=True)
        proc.communicate(input=text)
    except Exception:
        pass

def main():
    cmd_bin = ensure_cloudflared()
    print('Cloudflare 온라인 공개 터널을 생성 중입니다 (약 3~5초 소요)...')

    proc = subprocess.Popen(
        [cmd_bin, 'tunnel', '--url', 'http://localhost:8080'],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8',
        errors='ignore'
    )

    url_found = None
    # Cloudflared outputs tunnel URL to stderr
    for line in iter(proc.stderr.readline, ''):
        m = re.search(r'(https://[a-zA-Z0-9-]+\.trycloudflare\.com)', line)
        if m:
            url_found = m.group(1)
            copy_to_clipboard(url_found)
            print('\n' + '=' * 72)
            print('  🎉 온라인 공개 주소가 성공적으로 생성되었습니다!')
            print('=' * 72)
            print(f'\n  👉 접속 주소:  {url_found}\n')
            print('  📋 클립보드에 자동 복사되었습니다! (친구에게 Ctrl + V 로 전달)')
            print('  🌐 전 세계 어디서든 모바일이나 PC 브라우저로 접속 가능합니다.')
            print('  ⚠️  이 창을 닫으면 외부 접속이 종료되니 켜두시기 바랍니다.')
            print('=' * 72 + '\n')
            try:
                webbrowser.open(url_found)
            except Exception:
                pass
            break

    # Keep running and output basic connection status
    try:
        for line in iter(proc.stderr.readline, ''):
            if 'Registered tunnel connection' in line or 'ERR' in line:
                if 'Registered tunnel connection' in line:
                    print('[연결 상태] Cloudflare 글로벌 엣지 서버와 정상 연결 유지 중...')
                elif 'ERR' in line:
                    print(line.strip())
    except KeyboardInterrupt:
        print('\n터널을 종료합니다.')
    finally:
        proc.terminate()

if __name__ == '__main__':
    main()
