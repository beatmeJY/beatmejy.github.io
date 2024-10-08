---
title: "CBC와 GCM, 어떤 차이가 있고 성능은 얼마나 다를까?"
description: "AES-GCM 동작과 CBC 대비 보안·성능 차이를 실험으로 확인한 뒤, JWT 필드 암호화를 GCM으로 바꾼 과정"
date: "2024-10-08"
category: "Backend"
tags:
  - Java
  - Security
  - AES-GCM
draft: false
---

[JWT 필드를 암호화하며 정리했던 글](https://beatmejy.tistory.com/54)에서 추가 학습 키워드로 남겨 둔 GCM을 이번에 제대로 파봤다. GCM 동작 원리를 정리하고, 쓰던 CBC와 보안·성능이 실제로 얼마나 다른지 실험한 뒤, 프로젝트 암호 모드를 바꿨다.

여기서 바꾼 것은 JWT 전체를 JWE로 감싼 이야기가 아니라, **토큰 안에 넣는 민감 필드(예: ID)를 AES로 암호화하는 쪽**이다. 헬퍼 이름도 `encryptId` / `decryptId`다. 모드만 `CBC` → `GCM`으로 교체했을 뿐, JWT를 쓴다는 전제 자체는 같다.

관련 문서: [NIST SP 800-38D - GCM 명세](https://csrc.nist.gov/pubs/sp/800/38/d/final)

---

## GCM의 동작 원리

GCM(Galois/Counter Mode)은 AES 블록 암호를 CTR(Counter Mode) 기반으로 병렬 처리하는 방식이다.

CTR은 각 블록을 독립적인 카운터 값으로 암호화해서 평문과 XOR한다.

![CTR 모드의 병렬 암호화 처리](/images/ctr-parallel-encryption.png)

블록 간 의존성이 없어 위 그림처럼 병렬로 암호화할 수 있다. 반면 CBC는 각 블록이 이전 블록의 암호화 결과에 의존해 XOR 연산을 수행하기 때문에 병렬 처리가 불가능하다.

![CBC 모드의 순차 암호화 처리](/images/cbc-sequential-encryption.png)

GCM은 이 CTR 위에 인증 기능을 얹은 방식이다. 동작 과정은 다음과 같다.

![GCM 전체 동작 과정](/images/gcm-process-diagram.png)

**1. IV(Nonce) 생성**
- 암호화할 때마다 다른 암호문을 만들기 위한 랜덤 값이다.
- GCM은 보통 96비트(12바이트) 고정 크기로 생성한다. 다른 길이를 쓰면 별도 해시 처리가 필요하다.
- 이 IV는 암호화할 데이터와 결합되어 카운터 모드의 초기값을 만든다.

**2. 카운터 초기화**
- IV와 카운터 값을 결합해 초기 카운터 값(J0)을 설정한다.
- 카운터는 블록 단위로 증가하며, 이 값이 AES 알고리즘의 입력이 되어 암호화된 출력 블록을 만든다.
- 첫 번째 카운터 블록은 주로 IV를 사용하고, 이후 각 블록마다 카운터를 1씩 증가시키며 암호화가 진행된다.

**3. AES 암호화 수행**
- 각 블록을 대칭키로 암호화한다.
- 각 데이터 블록이 서로 다른 카운터 값과 결합되어 독립적으로 처리되므로 병렬 처리가 가능하다.

**4. Galois 필드 연산과 인증 태그 생성**
- 인증 태그(MAC)는 암호화된 데이터의 무결성을 검증하기 위해 생성된다.
- Galois 필드에서의 곱셈 연산(GHASH)으로 태그 값을 계산한다.
- 암호화되지 않지만 인증은 필요한 데이터(AAD)도 이 태그 계산에 포함할 수 있다.
- AAD와 인증 태그는 암호문과 함께 전송되어, 복호화 시 데이터 변조 여부를 확인하는 데 쓰인다.

이렇게 암호화와 인증을 동시에 수행하는 방식을 AEAD(Authenticated Encryption with Associated Data)라고 부른다.

---

## GCM vs CBC 보안적 차이

**패딩 오라클**  
CBC는 패딩이 필요하고, 이 패딩 검증 로직이 [padding oracle attack](https://en.wikipedia.org/wiki/Padding_oracle_attack)에 취약할 수 있다. GCM은 CTR 기반이라 스트림 암호처럼 필요한 만큼만 암호화하므로 패딩 자체가 없다. 그 공격 경로가 사라진다.

**인증**  
GCM은 GHASH 기반 인증 태그로 무결성을 함께 보장한다. 중간에서 암호문이 변조되면 복호화 시점에 검증이 실패한다. 원시 CBC에는 이런 인증이 없어서, 무결성이 필요하면 HMAC을 따로 붙여 Encrypt-then-MAC을 만들어야 한다. 라이브러리/JWT 표준 조합이 이미 EtM을 묶어 주는 경우와, 필드만 AES-CBC로 돌리던 경우는 다르다. 당시 구현은 후자에 가깝다고 봤다.

**IV 재사용 위험 — 여기가 CBC와 결정적으로 다르다**  
CBC는 IV가 재사용돼도 보안이 점진적으로 약화되는 정도지만, GCM은 **같은 키로 같은 IV(nonce)를 두 번 쓰는 순간 심각하게 깨진다.** 서로 다른 평문을 같은 (키, IV)로 암호화하면 두 암호문의 XOR만으로 평문 정보 일부가 드러날 뿐 아니라, GHASH 인증 서브키(H)까지 역산할 수 있어 공격자가 임의 메시지에 유효한 태그를 붙일 수 있다("forbidden attack"). GCM으로 전환한다는 건 패딩 공격 내성·AEAD라는 이득을 얻는 대신, **IV 유일성을 절대 깨뜨리지 않아야 하는 더 엄격한 책임**을 지는 것이다.

전환 전에 확인한 것:

- 매 `encrypt` 호출마다 `SecureRandom` 등으로 IV를 새로 만드는가
- IV를 암호문과 함께 저장·전송하는가
- 키를 여러 인스턴스가 나눠 쓰더라도 IV가 겹칠 구조는 아닌가

이 체크를 통과한 뒤에야 CBC → GCM을 적용했다.

---

## 실제 성능 비교

같은 헬퍼 인터페이스로 CBC/GCM만 바꿔 100만 번 암·복호화를 돌려 봤다.

```java
private static final long REPEAT_COUNT = 1_000_000L;

@Test
@DisplayName("GCM 성능을 테스트한다.")
void testGcmPerformance() {
    long start = System.nanoTime();

    for (long i = 0; i < REPEAT_COUNT; i++) {
        String encryptedId = gcmDecryptHelper.encryptId(i);
        Long decryptedId = gcmDecryptHelper.decryptId(encryptedId);
        assertEquals(i, decryptedId);
    }

    long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
    System.out.println("GCM Mode Total Execution Time: " + elapsedMs + " ms");
}

@Test
@DisplayName("CBC 성능을 테스트한다.")
void testCbcPerformance() {
    long start = System.nanoTime();

    for (long i = 0; i < REPEAT_COUNT; i++) {
        String encryptedId = cbcDecryptHelper.encryptId(i);
        Long decryptedId = cbcDecryptHelper.decryptId(encryptedId);
        assertEquals(i, decryptedId);
    }

    long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
    System.out.println("CBC Mode Total Execution Time: " + elapsedMs + " ms");
}
```

GCM의 100만 번 실행 결과:

![GCM 100만 번 실행 결과](/images/gcm-performance-result.png)

CBC의 100만 번 실행 결과:

![CBC 100만 번 실행 결과](/images/cbc-performance-result.png)

적은 반복 횟수에서는 차이가 거의 없거나 들쑥날쑥했지만, 소요 시간이 초 단위로 나올 만큼 반복을 늘리자(100만 번 이상) GCM이 CBC보다 약 **15~20%** 빠르게 나왔다.

**다만 이 벤치마크에는 한계가 있다.** `System.nanoTime()` 루프는 JIT 워밍업·GC를 통제하지 못해서, JMH로 잰 값보다 오차가 클 수 있다. "정확히 17% 빠르다"고 주장하지는 않는다. 현장에서 필요했던 결론은 이거다.

> GCM이 CBC보다 뚜렷하게 느리지 않고, 같은 조건에선 오히려 빠른 쪽이 나왔다. 성능 때문에 CBC를 유지할 이유는 없었다.

**왜 GCM이 더 빠른가**: 알고리즘이 가벼워서만이 아니라, 현대 CPU가 AES-GCM을 하드웨어로 가속하기 때문이다. AES-NI는 AES 블록 암호를, PCLMULQDQ는 GHASH의 Galois 필드 곱셈을 가속한다. CTR의 병렬성과 이 가속이 맞물리면서 CBC의 순차 구조보다 실질 이득이 난다.

---

## 그래서 무엇을 바꿨는가

처음 CBC를 고른 이유는 단순했다. 오래 쓰여 자료가 많고, 예제를 따라가기 쉬웠다.

| | CBC (당시) | GCM (이후) |
| --- | --- | --- |
| 패딩 오라클 | 패딩 검증 실수 여지에 노출될 수 있음 | 패딩 없음 |
| 무결성 | 별도 MAC을 안 붙였다면 부족 | 태그 기본 제공 |
| 성능(우리 측정) | 기준 | 동등 이상(대략 15~20% 유리) |
| 운영 주의 | IV 품질 | **IV 유일성이 더 치명적** |

보안에서 손볼 이유가 없고, 성능도 발목을 잡지 않았다. IV가 매 호출마다 새로 만들어지는지만 재확인한 뒤, JWT 필드 암호화를 CBC에서 GCM으로 바꿨다.

---

## 참고

- [NIST SP 800-38D - GCM 명세](https://csrc.nist.gov/pubs/sp/800/38/d/final)
- [패딩을 사용하는 CBC 모드 대칭 암호 해독의 타이밍 취약성](https://learn.microsoft.com/ko-kr/dotnet/standard/security/vulnerabilities-cbc-mode)
- [TLS/암호 알고리즘 쉽게 이해하기 - MAC, AE, AEAD](https://blog.humminglab.io/posts/tls-cryptography-13-mac-aead/)
- [How does AES-GCM encryption work](https://crypto.stackexchange.com/questions/101106/how-does-aes-gcm-encryption-work)
- [Why would I ever use AES-256-CBC if AES-256-GCM is more secure?](https://security.stackexchange.com/questions/184305/why-would-i-ever-use-aes-256-cbc-if-aes-256-gcm-is-more-secure)
- [AES-GCM과 VAES 인스트럭션](https://wariua.github.io/facility/aes-gcm-and-vaes-instruction.html)
