---
title: "하위 서버 하나 죽었다고 우리 서버까지? 실제 장애 복구기"
description: "하위 서버 장애가 전체 서버의 스레드 풀 고갈로 번진 사고를 계기로 Resilience4j 서킷 브레이커를 도입한 과정"
date: "2023-10-14"
category: "Backend"
popularRank: 1
tags:
  - Java
  - Spring Boot
  - Resilience4j
draft: true
---

주문 데이터를 여러 하위 서버에 전달하는 배치 로직을 비동기로 전환한 지 한 달쯤 됐을 때, 협력 중이던 하위 서버 하나가 다운되면서 우리 서버의 스레드 풀까지 함께 고갈되는 사고가 있었다. 하위 서버가 죽었는데 왜 우리 서버까지 영향을 받았는지, 그리고 이걸 근본적으로 해결하기 위해 어떠한 작업을 했었는지 기록하려고 한다.

관련 문서: [Resilience4j CircuitBreaker 공식 문서](https://resilience4j.readme.io/docs/circuitbreaker)

---

## 문제 상황

- 증상: `하위 서버 장애 발생 직후`, 서버 내 일부 기능들이 응답하지 않기 시작함
- 영향 범위: 하위서버로의 비동기 주문 정보 전송 로직
- 처음 발견한 단서: 애플리케이션 로그에서 `ec2Server`로 향하는 여러 비동기 스레드에서 동일한 API 호출 오류가 반복적으로 발생하고 있음을 확인함

> 하위 서버 장애 발생 시점부터, 우리 서버의 비동기 스레드 풀이 약 40분 동안 고갈되어 일부 장애가 발생하는 상태로 유지됐다.

![스레드 풀 고갈 당시 대처 기록](/images/error_fix_history.png)

---

## 원인 분석

비동기 전환 당시 신경 썼던 부분과 실제로 문제가 됐던 부분이 달랐다. 확인한 순서와 결과는 다음과 같다.

- [x] 재전송 시 중복 전송으로 인한 데이터 정합성 문제 의심 → 전송 완료 플래그로 이미 대비되어 있었음, 원인 아님
- [x] 애플리케이션 로그 확인 → `ec2Server`로 향하는 비동기 스레드에서 동일한 호출 오류가 반복 발생, 문제 범위를 좁힘
- [x] 스레드 풀 설정(core/max size, queue capacity) 확인 → 로컬 테스트용으로 줄여뒀던 값이 운영에도 잘못 반영됐는지 의심했지만, 200으로 정상 적용되어 있었음, 원인 아님
- [x] 스레드 덤프 확인 → 워커 스레드 대부분이 `TIMED_WAITING` 상태로, 전부 `SubServerClient.sendOrder()`의 소켓 응답 대기 지점에 멈춰 있었음. 대기 시간(`elapsed`)이 대체로 60초 근처에서 끊기는 패턴 확인
- [x] 하위 서버 API 타임아웃 설정 확인 → Feign 클라이언트에 별도 타임아웃 설정이 없다는 걸 확인, 정확한 기본값은 소스로 재확인

> 스레드 풀 고갈 당시 스레드 재현
![스레드 풀 고갈 당시 스레드 덤프](/images/error_replay.png)

워커 스레드가 전부 응답 대기 상태라면, 새로 들어오는 작업을 받을 스레드가 없으니 큐에 작업이 계속 쌓이고 있을 것이다. (다만 큐에 실제로 몇 건이 쌓여 있는지는 스레드 덤프만으로는 보이지 않아서, 이건 스레드 상태로부터의 추론이었다.)

대기 시간이 하필 60초 근처에서 끊기는 이유를 확인하려고 `feign.Request.Options` 소스를 직접 열어봤다.

```java
// feign.Request.Options

/**
 * Defaults to 10 seconds. {@code 0} implies no timeout.
 *
 * @see java.net.HttpURLConnection#getConnectTimeout()
 */
public int connectTimeoutMillis() {
  return (int) connectTimeoutUnit.toMillis(connectTimeout);
}

/**
 * Defaults to 60 seconds. {@code 0} implies no timeout.
 *
 * @see java.net.HttpURLConnection#getReadTimeout()
 */
public int readTimeoutMillis() {
  return (int) readTimeoutUnit.toMillis(readTimeout);
}
```

**실제 원인은 여기 있었다.** 별도 설정이 없으면 connectTimeout 10초, readTimeout 60초가 기본값으로 그대로 적용되고, 하위 서버가 커넥션은 맺어주고 응답만 주지 않는 상황이라면 스레드 하나가 요청 하나당 최대 60초까지 붙잡혀 있을 수 있었던 것이다. 스레드 덤프에서 본 60초 근처의 대기 시간이 정확히 이 기본값과 일치했다.

---

## 임시 대응

당장 서비스에 영향을 줄이기 위해 먼저 손댄 두 가지다. 둘 다 재발 자체를 막지는 못하지만, 서킷 브레이커를 붙이기 전까지 피해를 줄이는 역할을 했다.

### 1. 스레드 풀 격리 (기존에 이미 적용됨)

쓰레드 풀이 고갈된 로직이 담당하는 데이터를 받는 서버가 애초에 장애가 나있는 상황이라, 추후 복구되었을때 그동안 전달되지 않는 데이터를 모아 전송하는 배치로직으로 되돌려 상황을 대처했고,

해당 비동기 로직은 원래도 별도 스레드 풀을 지정하여 격리되어 있어 실제 운영에는 문제가 없었다.

```java
@Configuration
@EnableAsync
public class AsyncThreadConfigure {

    private final int CORE_POOL_SIZE = 200;
    private final int MAX_POOL_SIZE = 200;
    private final int QUEUE_CAPACITY = 50;
    private final String CUSTOM_THREAD_NAME_PREFIX = "ASYNC_THREAD-";

    @Bean(name = "asyncThreadPoolTaskExecutor")
    public Executor threadPoolTaskExecutor() {
        ThreadPoolTaskExecutor taskExecutor = new ThreadPoolTaskExecutor();
        taskExecutor.setCorePoolSize(CORE_POOL_SIZE);
        taskExecutor.setMaxPoolSize(MAX_POOL_SIZE);
        taskExecutor.setQueueCapacity(QUEUE_CAPACITY);
        taskExecutor.setThreadNamePrefix(CUSTOM_THREAD_NAME_PREFIX);
        taskExecutor.initialize();
        return taskExecutor;
    }
}
```

> 스레드 풀 격리로 전파되지 않는 상황 예시
![장애 전파되지 않는 예시](/images/non_propagated_failure.png)

다만 위처럼 쓰레드 풀이 격리되어 있다해도 **피해 범위를 줄일 뿐**, 스레드가 응답 없는 서버를 계속 기다리다 고갈되는 근본 원인은 해결하지 못한다.

### 2. Feign 타임아웃 서버별로 단축

가장 먼저 손댄 건 원인으로 지목된 Feign의 기본 readTimeout(60초)이었다. 응답 없는 요청 하나가 스레드를 60초씩 붙잡고 있을 이유가 없었다. 다만 통신하던 하위 서버들의 평소 응답 시간이 서버마다 제각각이었기 때문에, `default` 설정으로 일괄 적용하지 않고 **서버별로 개별 타임아웃을 설정**했다. (아래 서버명과 수치는 예시이며, 실제 서버명 일부는 사내 보안상 각색했다.)

```yaml
# application.yml
feign:
  client:
    config:
      ec2Server:      # 자체 EC2에 올라간 애플리케이션 서버, 평소엔 응답이 빠르지만 이번 장애의 당사자였음
        connectTimeout: 1000   # ms
        readTimeout: 3000      # ms, 기존 기본값 60초 → 3초
      pickingServer:  # 물류 피킹(출고 준비) 처리 서버, 물리적인 처리 과정이 껴 있어 응답이 상대적으로 느린 편
        connectTimeout: 1000   # ms
        readTimeout: 15000     # ms, 기존 기본값 60초 → 15초
      # 그 외에도 여러 하위 서버가 있었지만, 대표적으로 두 곳만 예시로 남긴다.
```

각 서버의 평소 응답 시간(평균 기준)에 여유를 둔 값을 개별로 잡았다. `ec2Server`처럼 순수 애플리케이션 로직만 처리하는 서버는 응답이 빨랐지만, `pickingServer`는 실제 피킹(출고 준비) 처리와 얽혀 있어 물리적인 처리 시간이 섞이는 만큼 응답이 느린 편이었다. 하나의 값으로 통일했다면, 빠른 서버는 불필요하게 오래 기다리게 되고 느린 서버는 정상 응답인데도 타임아웃으로 끊길 위험이 있었다.

타임아웃을 줄인 것만으로도 스레드 하나가 점유되는 최대 시간이 60초에서 서버별로 3~15초 수준(예: ec2Server 3초, pickingServer 15초)으로 줄어, 같은 시간 동안 스레드 풀이 고갈되기까지 걸리는 시간이 늘어나는 효과가 있었다.

**하지만 이건 고갈되는 속도를 늦췄을 뿐이다.** 하위 서버 장애가 길게 이어지면 여전히 풀이 채워질 수 있는 구조라, 이 글에서 실제로 하고 싶은 이야기인 근본 해결로 넘어간다.

---

## 근본 해결: Resilience4j 서킷 브레이커

> 이 글에서 가장 핵심적인 부분이다. 임시 대응은 장애가 터졌을 때의 충격을 줄이는 데 그쳤지만, 서킷 브레이커는 하위 서버 장애가 우리 서버로 전파되는 경로 자체를 끊는 조치다.

`resilience4j-spring-boot3` 의존성을 추가하고 아래처럼 설정했다.

설정값은 임의로 고른 게 아니라, 주문이 몰리는 피크 시간대의 실제 트래픽(초당 약 1,000건)을 기준으로 잡았다.

- **sliding-window-size: 100 (COUNT_BASED)** — 피크 시간대 기준 100건이 쌓이는 데 걸리는 시간은 약 0.1초다. 장애가 터졌을 때 100ms 안에 판단할 수 있는 반응성을 확보하는 게 목적이었다. 트래픽이 적은 시간대엔 window가 채워지는 데 더 오래 걸리지만, 그만큼 스레드 풀이 소진될 위험도 낮기 때문에 반응이 느려져도 괜찮다고 판단했다.
- **failure-rate-threshold: 50%** — 순간적인 네트워크 노이즈(단발성 타임아웃 한두 건)만으로 서킷이 열리는 오탐을 피하면서도, 실제 장애는 빠르게 잡아내기 위한 균형점으로 잡았다. 이번에 장애를 냈던 `ec2Server`는 readTimeout이 3초로 설정되어 있었는데, 피크 시간대(초당 1,000건) 기준으로 실패율이 50%까지 올라간다는 건 초당 약 500건의 요청이 스레드를 점유하기 시작한다는 뜻이다. 스레드 풀 최대 크기(200개)를 감안하면, 요청 하나당 점유 시간(3초)이 풀이 채워지는 데 걸리는 시간(약 0.4초, 200개 ÷ 초당 500건)보다 길기 때문에 이론상 약 0.4초 만에 풀 전체가 소진될 수 있는 구조였다. readTimeout 값 자체보다, 실패 요청의 유입 속도가 풀 소진 속도를 좌우한다는 걸 이 계산에서 확인했다.
- **wait-duration-in-open-state: 10s** — 장애를 냈던 `ec2Server`의 readTimeout(3초)보다는 넉넉하게, `pickingServer`처럼 원래 응답이 느린 서버의 readTimeout(15초)보다는 짧게 잡아 절충한 값이다. 너무 길게 잡으면 서버가 복구된 뒤에도 오랫동안 요청을 막아 정상 트래픽까지 놓칠 수 있고, 너무 짧으면 아직 회복되지 않은 서버에 자주 재시도를 보내게 되기 때문이다.

또한 `@CircuitBreaker`는 기본적으로 모든 예외를 실패로 카운트하기 때문에, 하위 서버가 던지는 4xx 같은 비즈니스 예외까지 서킷 실패에 포함되지 않도록 `record-exceptions`로 통신 장애성 예외만 명시적으로 잡았다.

```yaml
# application.yml
resilience4j:
  circuitbreaker:
    instances:
      ec2Server:
        sliding-window-size: 100          # 최근 100건의 호출을 기준으로 판단
        failure-rate-threshold: 50        # 실패율 50% 이상이면 Open
        wait-duration-in-open-state: 10s  # Open 상태 유지 시간
        permitted-number-of-calls-in-half-open-state: 5
        automatic-transition-from-open-to-half-open-enabled: true
        record-exceptions:
          - java.net.SocketTimeoutException  # Feign readTimeout 초과
          - java.io.IOException               # 커넥션 실패 등 네트워크 계층 오류
          - feign.RetryableException          # Feign이 네트워크 오류를 래핑한 예외
        ignore-exceptions:
          - com.example.exception.BusinessException  # 하위 서버가 던지는 4xx성 비즈니스 예외는 실패로 세지 않음
```

`record-exceptions`에 넣은 예외들은 전부 "하위 서버와의 통신 자체가 실패했다"는 신호이고, `ignore-exceptions`로 뺀 비즈니스 예외는 "통신은 됐지만 요청 자체가 잘못됐다"는 신호다. 이 둘을 구분하지 않으면, 데이터 검증 오류가 잠깐 몰렸을 뿐인데 서킷이 열려버리는 상황이 생길 수 있다.

```java
@FeignClient(name = "ec2Server", url = "${ec2-server.url}")
public interface SubServerFeignClient {

    @PostMapping("/api/orders")
    OrderResponse sendOrder(@RequestBody OrderRequest request);
}
```

```java
@Service
@RequiredArgsConstructor
public class SubServerClient {

    private final SubServerFeignClient subServerFeignClient;

    @CircuitBreaker(name = "ec2Server", fallbackMethod = "fallback")
    public OrderResponse sendOrder(OrderRequest request) {
        return subServerFeignClient.sendOrder(request);
    }

    // Open 상태이거나 호출이 실패했을 때 대신 실행되는 메서드
    private OrderResponse fallback(OrderRequest request, Throwable t) {
        log.warn("ec2Server 호출 실패, fallback 처리: {}", t.getMessage());
        return OrderResponse.failed(request.getOrderId());
    }
}
```

**서버별로 다르게 설정한 타임아웃(임시 대응)으로 요청 하나의 최대 대기 시간을 제한하고, 그 위에 서킷 브레이커(근본 해결)를 얹어 반복되는 실패를 감지해 이후 요청 자체를 차단하는 구조다.** 임시 대응만으로는 장애가 지속되는 한 계속 요청을 흘려보낼 수밖에 없었지만, 여기서부터는 장애가 감지되는 즉시 하위 서버로의 요청 자체를 끊어버린다.

---

## 왜 이렇게 해결했는가?

### 대안 A: 타임아웃만 설정

응답하지 않는 하위 서버를 무한정 기다리지 않도록
연결 및 읽기 타임아웃을 서버별 평소 응답 시간에 맞춰 60초에서 3~15초 수준으로 줄였다.

스레드가 장시간 점유되는 문제를 줄일 수 있지만,
장애가 지속되는 동안에도 타임아웃 간격(서버별 3~15초)마다 하위 서버 호출이 계속 발생한다.

### 대안 B: Retry 적용

일시적인 네트워크 오류에는 도움이 될 수 있지만,
하위 서버 자체가 다운된 상황에서는 실패한 요청을 반복해서 전송하게 된다.

오히려 장애 서버에 추가 부하를 발생시킬 수 있다.

### 선택: Timeout + Circuit Breaker

타임아웃으로 개별 요청이 무한정 대기하지 않도록 제한하고,
실패가 일정 수준 이상 누적되면 Circuit Breaker를 OPEN 상태로 전환해
하위 서버에 대한 추가 요청 자체를 차단하도록 했다.

결과적으로 하위 서버의 장애가 지속되는 동안
우리 서버의 스레드가 계속 외부 API 응답을 기다리는 상황을 줄이고,
장애가 혹시 모를 다른 기능으로 전파되는 것을 막는 것을 목표로 했다.

---

## 결과

Before:

- Feign readTimeout 기본값(60초) 그대로 사용
- 하위 서버 장애 발생 시 요청마다 최대 60초씩 스레드 점유
- 작업 큐 지속 증가, 약 40분 만에 스레드 풀 고갈
- 일부 기능 장애 발생

After:

- Feign readTimeout을 서버별 평소 응답 시간에 맞춰 60초 → 3~15초로 단축, 요청당 최대 대기 시간 단축
- 실패율 임계치 도달 시 Circuit Open
- Open 이후 하위 서버 호출 차단, 비동기 스레드 풀의 추가 점유 방지

---

### 남은 리스크와 대응

- 실패한 주문 데이터가 유실되지 않도록 실패 건을 별도로 모아
  하위 서버 복구 후 자동으로 재전송하는 배치 로직을 구성했다.
- Circuit이 Open 상태로 전환되면 장애 상황을 인지할 수 있도록
  Slack 알림을 추가했다.

---

## 배운 점

- 다른 서버와 통신하는 코드를 작성할 때는 내 코드의 정상 동작뿐 아니라, 상대 서버가 응답하지 않는 상황까지 항상 고려해야 한다.
- 외부 클라이언트 라이브러리(Feign 등)의 기본 타임아웃 값을 확인하지 않고 그대로 쓰면, 생각보다 훨씬 긴 시간 동안 스레드가 점유될 수 있다.
- 서버마다 트래픽 패턴과 응답 특성이 다르므로, 하나의 값으로 일괄 설정하기보다 각 서버의 상황과 트래픽을 파악해서 타임아웃·서킷 브레이커 같은 설정을 서버별로 다르게 잡는 게 중요하다.
- 서킷브레이커가 open 되고 다시 close가 되었을 때, 장애가 된 데이터 등의 뒤처리 로직 설계도 중요하다.
- 팀 컨벤션으로 가져갈 것: 외부 API를 호출하는 모든 클라이언트 코드에는 타임아웃과 서킷 브레이커를 기본으로 적용한다.

---

## 참고

- [Resilience4j CircuitBreaker 공식 문서](https://resilience4j.readme.io/docs/circuitbreaker)
- [Spring Boot 레퍼런스](https://docs.spring.io/spring-boot/docs/current/reference/html/)
- [Spring Cloud OpenFeign 레퍼런스](https://docs.spring.io/spring-cloud-openfeign/reference/)
