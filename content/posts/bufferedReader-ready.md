---
title: "자바 BufferedReader.ready() 사용해도 괜찮을까?"
description: "소켓에서 데이터가 아직 도착하지 않았을 때 ready()가 non-blocking하게 false를 반환하면서 겪은 버그와, 그 원인을 소스 코드로 추적한 과정"
date: "2023-12-11"
category: "Backend"
tags:
  - Java
  - IO
draft: false
---

토이 프로젝트에서 Socket의 `InputStream`을 `BufferedReader`로 감싸 HTTP 메시지를 읽어오다가 겪었던 실수를 정리한다. `ready()`를 "읽을 데이터가 있는지 확인하는 메서드"로 오해하고 사용했다가, 데이터가 있는데도 없다고 판단해버리는 버그를 만들었다.

관련 문서: [Oracle BufferedReader 공식 문서](https://docs.oracle.com/javase/8/docs/api/java/io/BufferedReader.html)

---

## 문제 상황

- 증상: 최초 요청(`index.html`)은 정상적으로 읽히지만, 그 안에서 import된 `.js`, `.css` 등 추가 리소스 요청의 응답이 계속 빈 값으로 처리됨
- 영향 범위: `Socket`의 `InputStream`을 `BufferedReader`로 감싸 한 줄씩 읽어오는 로직 전체
- 처음 발견한 단서: `ready()`로 준비 여부를 확인한 뒤 `readLine()`으로 읽는 구조에서, 두 번째 요청부터 `ready()`가 `false`를 반환해 아예 읽기 로직 진입 자체를 못 함

문제가 발생한 코드는 다음과 같았다.

```java
try (final InputStream inputStream = connection.getInputStream();
     final OutputStream outputStream = connection.getOutputStream()) {
    BufferedReader bufferedReader = new BufferedReader(new InputStreamReader(inputStream));
    if (bufferedReader.ready()) {
        String line;
        while ((line = bufferedReader.readLine()) != null) {
            // 읽은 데이터를 담는 로직
        }
    }
}
```

의도는 단순했다. `ready()`로 "읽을 데이터가 있는지" 먼저 확인하고, 있으면 `readLine()`으로 끝까지 읽어오려 했다.

재현 순서는 다음과 같다.

1. 소켓 연결이 막 성립된 직후 `bufferedReader.ready()`를 호출한다
2. 소켓에 데이터가 아직 도착하지 않은 시점이라 `ready()`가 `false`를 반환한다
3. `if` 블록 진입 자체가 안 되면서, 실제로는 곧 도착할 데이터를 "없다"고 판단하고 넘어가 버린다

> `ready()`는 지금 이 순간 블로킹 없이 즉시 읽을 수 있는지를 확인하는 메서드이지, 스트림에 데이터가 결국 도착하는지를 보장하는 메서드가 아니다. 그런데도 나는 이걸 "**읽을 데이터가 있는지**"를 확인하는 용도로 썼다.

---

## 원인 분석

공식 문서의 설명만 보고 판단한 것과, 실제 소스 코드를 뜯어봤을 때 드러난 사실이 달랐다.

- 가설(처음 예상): `ready()`의 문서 설명 — "버퍼가 비어 있지 않거나 기본 문자 스트림이 준비되면 준비된 것" — 을 "읽을 데이터가 존재하는지" 확인하는 용도로 해석함
- 실제 원인: `ready()`는 내부적으로 `in.ready()` 호출 결과를 그대로 반환하는 **non-blocking** 메서드였고, 소켓에 데이터가 아직 도달하지 않은 시점에 호출되면 즉시 `false`를 반환함

`ready()`의 실제 구현은 다음과 같다.

```java
public boolean ready() throws IOException {
    synchronized (lock) {
        ensureOpen();

        if (skipLF) {
            if (nextChar >= nChars && in.ready()) {
                fill();
            }
            if (nextChar < nChars) {
                if (cb[nextChar] == '\n')
                    nextChar++;
                skipLF = false;
            }
        }
        return (nextChar < nChars) || in.ready();
    }
}
```

`BufferedReader` 생성 직후 호출이라 `skipLF`가 `false`이므로, 결국 마지막 줄의 `in.ready()` 하나로 결과가 결정된다. 이 `in.ready()`는 하위 `InputStreamReader`가 지금 당장 블로킹 없이 읽을 수 있는지만 확인하기 때문에, 소켓에 데이터가 도착하기 전이면 그대로 `false`가 나온다.

그렇다면 `readLine()`이나 `read()`는 왜 데이터가 도착할 때까지 알아서 기다려주는 걸까? `readLine()` → `fill()` → `read()` 순서로 내부 구현을 따라가 보면 답이 나온다.

```java
// readLine() 내부에서 버퍼가 비면 fill() 호출
bufferLoop:
for (;;) {
    if (nextChar >= nChars)
        fill();
    ...
}
```

```java
// fill()은 하위 스트림의 read()가 데이터를 반환할 때까지 반복
private void fill() throws IOException {
    ...
    do {
        n = in.read(cb, dst, cb.length - dst);
    } while (n == 0);
    ...
}
```

```java
// BufferedReader.read()는 while (in.ready())로 실질적으로 블로킹
public int read(char[] cbuf, int off, int len) throws IOException {
    synchronized (lock) {
        ...
        int n = read1(cbuf, off, len);
        if (n <= 0) return n;
        while ((n < len) && in.ready()) {
            int n1 = read1(cbuf, off + n, len - n);
            if (n1 <= 0) break;
            n += n1;
        }
        return n;
    }
}
```

`ready()`와 `readLine()`/`read()`의 차이를 정리하면 다음과 같다.

| 메서드 | 동작 방식 | 데이터가 아직 도착하지 않았을 때 |
| --- | --- | --- |
| `ready()` | `in.ready()` 결과를 그대로 반환 | 즉시 `false` 반환 (non-blocking) |
| `readLine()` / `read()` | `fill()` 내부에서 하위 스트림의 `read()`가 값을 반환할 때까지 반복 대기 | 데이터가 도착할 때까지 블로킹 |

디버깅 체크리스트는 다음과 같았다.

- [x] `ready()` 소스 코드 확인
- [x] `readLine()` / `fill()` / `read()` 소스 코드 확인
- [x] 소켓 데이터 도착 시점과 `ready()` 호출 시점의 순서 비교

---

## 해결 방법

### 코드

원인이 "존재 여부 확인용으로 쓴 `ready()`가 non-blocking이라 생긴 문제"였으므로, 해결 방향은 단순하다. 데이터가 있는지 미리 확인하지 않고, `readLine()`이 스스로 데이터 도착까지 기다렸다가 스트림 종료 시 `null`을 반환하는 특성을 그대로 활용하면 된다.

```java
try (final InputStream inputStream = connection.getInputStream();
     final OutputStream outputStream = connection.getOutputStream()) {
    BufferedReader bufferedReader = new BufferedReader(new InputStreamReader(inputStream));
    String line;
    while ((line = bufferedReader.readLine()) != null) {
        // 읽은 데이터를 담는 로직
    }
}
```

`ready()` 체크를 걷어내고 바로 `readLine()`으로 진입하면, 데이터가 아직 도착하지 않은 경우 알아서 블로킹하며 기다리고, 스트림이 끝나면 `null`을 반환해 자연스럽게 루프가 종료된다.

---

## 왜 이렇게 해결했는가?

### 대안 A: `ready()`로 먼저 확인 후 `readLine()` 반복 (기존 방식)

`ready()`를 non-blocking 가드로 쓰는 방식이었지만, 소켓처럼 데이터가 비동기적으로 도착하는 스트림에서는 정작 곧 도착할 데이터를 "없다"고 오판할 수 있다는 게 이번에 드러난 문제였다.

### 대안 B: `InputStream.available()` 등 다른 non-blocking API로 대체

`ready()` 대신 다른 non-blocking 확인 메서드를 쓰는 방법도 고려할 수 있지만, `available()` 역시 현재 버퍼에 있는 바이트 수를 반환할 뿐 데이터가 도착할 때까지 기다려주지 않는다는 점은 동일하다. 근본적으로 같은 함정에 다시 빠질 여지가 있다.

### 선택: 존재 여부를 미리 확인하지 않고 `readLine()`의 블로킹 특성에 맡긴다

`readLine()`은 데이터가 도착할 때까지 안전하게 대기하고, 스트림이 끝나면 `null`로 종료를 알려준다. 별도의 준비 상태 확인 없이 이 특성을 그대로 활용하는 게 가장 단순하고 안전했다.

---

## 결과

Before:

- 최초 요청(`index.html`)만 정상적으로 읽힘
- 이후 추가 리소스 요청은 `ready()`가 `false`를 반환하며 빈 값으로 처리됨

After:

- `ready()` 체크를 제거하고 `readLine()`으로 바로 읽도록 변경
- 데이터 도착 시점과 무관하게 모든 요청의 응답을 정상적으로 읽어옴

*(실제로 수정 후 재현 테스트를 진행하셨다면, 그 결과나 이후 관찰한 지표가 있으면 알려주세요 — 여기 채워 넣겠습니다.)*

---

## 배운 점

- `ready()`라는 이름과 "버퍼가 비어 있지 않거나 준비되면"이라는 문서 설명만 보면, 읽을 데이터가 있는지 확인하는 용도로 충분히 착각할 수 있다.
- 하지만 `ready()`는 non-blocking하게 "지금 이 순간" 읽을 수 있는지만 알려줄 뿐, 데이터가 결국 도착하는지는 보장하지 않는다. 소켓처럼 데이터가 비동기적으로 들어오는 스트림에서 존재 여부 확인용으로 쓰는 건 부적절하다.
- 나중에 회사에서 공용으로 쓸 라이브러리를 만든다면, 메서드 이름과 주석을 지금보다 훨씬 명확하게 지어야겠다고 생각했다.

---

## 참고

- [Oracle BufferedReader 공식 문서](https://docs.oracle.com/javase/6/docs/api/java/io/BufferedReader.html#ready%28%29)
- [Stack Overflow - Does BufferedReader.ready() method ensure that readLine() method does not return NULL?](https://stackoverflow.com/questions/5244839/does-bufferedreader-ready-method-ensure-that-readline-method-does-not-return)
