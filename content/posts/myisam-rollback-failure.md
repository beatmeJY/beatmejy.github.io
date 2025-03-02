---
title: "@Transactional을 믿었는데 원자성이 깨졌다"
description: "동일 트랜잭션에서 수정한 두 행 중 하나만 롤백되지 않은 문제. 처음 세운 가설과 임시 조치, 그리고 실제 원인을 찾기까지의 과정을 정리한다."
date: "2025-03-02"
category: "Backend"
tags:
  - Spring
  - JPA
  - MySQL
  - MyISAM
  - InnoDB
  - Storage Engine
  - Transactional
  - Rollback
draft: false
popularRank: 3
---

같은 `@Transactional` 메서드 안에서 한 테이블의 두 행을 수정했는데, 예외로 트랜잭션이 롤백된 뒤 확인해보니 첫 번째 행의 변경만 DB에 남아 있었다. 트랜잭션은 "전부 반영되거나, 전부 반영되지 않거나"를 보장해야 하는데 그 전제가 깨진 상황이었다.

처음에는 JPA의 flush 타이밍을 의심했고, 조회 순서를 바꿔 당장의 문제는 피했다. 하지만 그건 증상을 가린 것이었고, 진짜 원인은 전혀 다른 곳에 있었다.

---

## 문제 상황

- 증상: 트랜잭션 롤백 후에도 첫 번째로 수정한 행의 변경사항만 DB에 남아 있음
- 영향 범위: 입고 예정일(`inbound_date`)을 변경하면서 두 날짜의 예약 수량을 함께 조정하는 로직
- 발견 경위: 운영 반영 전 테스트 중, 예외 상황에서 수량 합계가 맞지 않는 걸 확인

입고 예정일을 바꾸면, 기존 날짜의 예약 수량은 빼고 새 날짜의 예약 수량은 더해야 한다. 두 작업은 반드시 함께 성공하거나 함께 실패해야 한다.

```java
@Transactional
public InboundResDTO updateMultiInboundAndSchedule(...) {
    // 기존 날짜 예약 수량 차감
    ScheduleEntity beforeScheduleEntity = inboundScheduleService.findByInboundDate(beforeShippingDate);
    scheduleService.adjustReservedInboundQty(-beforeExpectedCount, beforeScheduleEntity);

    // 새 날짜 예약 수량 증가
    ScheduleEntity afterScheduleEntity = inboundScheduleService.findByInboundDate(updateShippingDate);
    scheduleService.adjustReservedInboundQty(updateExpectedCount, afterScheduleEntity);

    // ... 이후 로직에서 예외 발생 → 롤백
}
```

기대한 결과와 실제 결과는 이랬다.

| | 기존 날짜(before) | 새 날짜(after) |
| --- | --- | --- |
| 기대 (롤백) | 원래 값 유지 | 원래 값 유지 |
| 실제 | **차감된 값이 남음** | 원래 값 유지 |

> 롤백이 일어났는데 한 행만 되돌아가지 않았다. 기존 날짜의 예약 수량이 실제보다 적게 기록되면서, 그 날짜에 받을 수 있는 수량이 부풀려지는 문제로 이어진다.

---

## 원인 분석

### 첫 번째 가설: UPDATE가 트랜잭션 도중에 먼저 나갔다

가장 먼저 쿼리 로그를 확인했다. JPA는 엔티티를 수정해도 바로 UPDATE를 보내지 않고, 변경사항을 영속성 컨텍스트에 모아뒀다가 커밋 직전에 한꺼번에 보낸다(쓰기 지연). 그런데 로그에서는 before의 UPDATE가 트랜잭션 한가운데에서 먼저 나가고 있었다(간소화).

```sql
-- 1) before 조회
select * from schedule where inbound_date = '2025-03-11';

-- 2) after를 조회하기 직전, before의 변경사항이 먼저 나감
update schedule set reserved_qty = 70 where schedule_id = 497;

-- 3) after 조회
select * from schedule where inbound_date = '2025-03-12';
```

Hibernate의 기본 flush 모드(`AUTO`)는 **아직 DB에 보내지 않은 변경사항이 있는 테이블을 JPQL로 조회하기 직전**에 flush를 한다. 그렇지 않으면 방금 수정한 값이 반영되지 않은 낡은 조회 결과가 돌아올 수 있기 때문이다.

`findByInboundDate()`는 PK 조회가 아니라 JPQL 쿼리라서 영속성 컨텍스트만 보고 끝낼 수 없다. 같은 `schedule` 테이블에 미반영 변경사항(before의 수량 차감)이 있는 상태로 이 쿼리를 실행하니, Hibernate가 그 직전에 UPDATE를 먼저 보낸 것이다.

"먼저 나간 UPDATE가 롤백에서 빠졌다"는 가설을 세웠고, 중간 flush가 일어나지 않도록 두 행을 먼저 모두 조회한 뒤 수정하게 순서를 바꿨다.

```java
@Transactional
public InboundResDTO updateMultiInboundAndSchedule(...) {
    // 수정할 엔티티를 먼저 모두 조회
    ScheduleEntity beforeScheduleEntity = inboundScheduleService.findByInboundDate(beforeShippingDate);
    ScheduleEntity afterScheduleEntity = inboundScheduleService.findByInboundDate(updateShippingDate);

    // 조회가 끝난 뒤 수정
    scheduleService.adjustReservedInboundQty(-beforeExpectedCount, beforeScheduleEntity);
    scheduleService.adjustReservedInboundQty(updateExpectedCount, afterScheduleEntity);
    ...
}
```

두 번째 조회 시점에 아직 수정된 엔티티가 없으니 중간 flush가 일어나지 않고, UPDATE는 커밋 직전까지 미뤄진다. 커밋 전에 예외가 나면 UPDATE 자체가 나가지 않으므로 증상은 사라졌다.

### 그래도 설명이 안 되는 점

증상은 사라졌지만, 이 가설에는 구멍이 있었다. **트랜잭션 도중 UPDATE가 먼저 나가는 건 원래 정상적인 동작이다.**

JPA 없이 JDBC로 쿼리를 직접 실행하는 코드를 생각해보면 분명해진다. 코드는 위에서 아래로 순서대로 실행되니, 첫 번째 UPDATE는 두 번째 SELECT보다 당연히 먼저 DB에 도착한다.

```java
@Transactional
public void updateSchedule(...) {
    jdbcTemplate.update(
        "UPDATE schedule SET reserved_qty = reserved_qty - ? WHERE inbound_date = ?",
        beforeExpectedCount, beforeShippingDate);   // 여기서 이미 DB에 반영

    jdbcTemplate.queryForObject(
        "SELECT * FROM schedule WHERE inbound_date = ?", ...);

    throw new BusinessException(...);               // 롤백
}
```

트랜잭션이 보장하는 건 "쿼리가 커밋 시점에 한꺼번에 실행된다"가 아니라 "실행된 쿼리들이 함께 커밋되거나 함께 취소된다"이다. 이 코드도 정상적인 DB라면 롤백 시 UPDATE까지 되돌아가야 한다.

그렇다면 질문이 바뀐다. "왜 UPDATE가 먼저 나갔는가"가 아니라 **"먼저 나간 UPDATE가 왜 롤백되지 않았는가"**다. flush는 JPA가 정상적으로 한 일이고, 되돌리지 못한 건 애플리케이션이 아니라 DB 쪽이었다. 그래서 확인 대상을 코드에서 테이블 자체로 옮겼다.

### 진짜 원인: 테이블이 MyISAM이었다

테이블 정보를 확인하자 답이 나왔다.

```sql
SHOW TABLE STATUS WHERE Name = 'schedule';
-- Engine: MyISAM
```

`schedule` 테이블은 입사 전부터 존재하던 레거시 테이블이었다. DB 서버는 이미 MySQL 5.7로 올라가 있었지만, 이 테이블은 MyISAM이 기본 엔진이던 시절에 만들어진 뒤 한 번도 엔진이 바뀐 적이 없었다. 서버를 업그레이드해도 기존 테이블의 엔진은 그대로 따라오기 때문이다. 두 엔진이 UPDATE와 ROLLBACK을 처리하는 방식을 비교하면 왜 이게 원인인지 드러난다.

**InnoDB는 수정 전 값을 먼저 기록해둔다.** 행을 수정하기 전에 원래 값을 undo log에 기록하고, 그 다음 실제 데이터를 바꾼다. 트랜잭션이 커밋되기 전까지 이 undo log는 유지되고, `ROLLBACK`이 오면 이걸 거꾸로 적용해 원래 상태로 돌린다. UPDATE가 트랜잭션 도중 얼마나 일찍 나갔든 상관없다.

```text
[InnoDB]
UPDATE reserved_qty 100 → 70
  ├─ undo log에 "원래 값 100" 기록
  └─ 데이터 변경 (아직 커밋 전)

ROLLBACK
  └─ undo log를 적용해 100으로 복구  ✅
```

**MyISAM은 트랜잭션 자체를 지원하지 않는다.** undo log도 redo log도 없다. UPDATE가 실행되면 데이터 파일을 그 자리에서 바로 고쳐 쓰고, 그걸로 확정이다. 원래 값을 적어두는 절차가 없으니 `ROLLBACK`이 와도 되돌릴 대상이 없다.

```text
[MyISAM]
UPDATE reserved_qty 100 → 70
  └─ 데이터 파일에 즉시 기록 (그대로 확정)

ROLLBACK
  └─ 되돌릴 정보 없음 → 70 그대로  ❌
```

애플리케이션 입장에서는 롤백이 정상적으로 끝난 것처럼 보였다. 같은 트랜잭션 안의 다른 변경들은 정상적으로 롤백됐기 때문에 더더욱 이상을 알아채기 어려웠다.

### 전체 흐름으로 다시 보면

before와 after의 결과가 갈린 이유를 시점별로 정리하면 이렇다.

| 시점 | 애플리케이션 | DB로 나간 SQL | InnoDB였다면 | MyISAM (실제) |
| --- | --- | --- | --- | --- |
| T1 | before 조회 | SELECT | - | - |
| T2 | before 수량 차감 | (영속성 컨텍스트에만 반영) | - | - |
| T3 | after 조회 | **UPDATE before** → SELECT | undo log에 원래 값 기록 | **즉시 확정** |
| T4 | after 수량 증가 | (영속성 컨텍스트에만 반영) | - | - |
| T5 | 예외 → 롤백 | ROLLBACK | before 복구, after는 폐기 | before는 **복구 불가**, after는 폐기 |

- **before**는 T3의 flush로 이미 DB에 나갔고, MyISAM이라 그 순간 확정됐다. 롤백으로도 되돌릴 수 없다.
- **after**는 DB로 나간 적 없이 영속성 컨텍스트에만 있다가, 롤백 때 그대로 버려졌다. 롤백이 성공해서가 아니라 애초에 반영된 적이 없어서 사라진 것이다.

flush는 원인이 아니라 문제를 드러낸 계기였다. 테이블이 InnoDB였다면 중간 flush가 있었든 없었든 롤백은 정상적으로 동작했다.

---

## 해결 방법

### 임시 조치의 한계

앞서 적용한 조회 순서 변경은 증상을 피한 것뿐이었다. 커밋 시점에는 두 UPDATE가 순서대로 나가는데, 첫 번째가 성공하고 두 번째가 실패하면 MyISAM에서는 여전히 첫 번째만 남는다. 다른 코드에서 비슷한 패턴(수정 후 같은 테이블 재조회)을 쓰면 같은 문제가 그대로 재현된다. 코드 순서로는 원자성을 보장할 수 없었다.

### 근본 해결: 스토리지 엔진을 InnoDB로 변경

원자성은 코드가 아니라 스토리지 엔진이 보장해야 하는 성질이다. 테이블 엔진을 InnoDB로 바꾸기로 했다.

다만 `schedule` 하나만 바꾸고 끝낼 수는 없었다. 입사 전부터 있던 테이블이 MyISAM이었다면, 같은 시절에 만들어진 다른 테이블도 그럴 가능성이 컸다. 먼저 DB 전체에서 MyISAM 테이블을 모두 조회했다.

```sql
SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'your_db'
  AND ENGINE = 'MyISAM';
```

그렇다고 조회된 테이블을 한꺼번에 바꿀 수는 없었다. 엔진이 바뀌면 지금까지 문제없이 돌던 것들이 오히려 무너질 수 있기 때문이다. 테이블마다 아래 항목을 확인했다.

**변경 자체의 비용**
- `ALTER TABLE ... ENGINE=InnoDB`는 테이블을 통째로 새로 복사한다. MySQL 5.7에는 온라인 DDL이 있지만, 엔진 변경은 그 대상이 아니라 테이블 복사(COPY) 방식으로만 동작해서 복사하는 동안 쓰기가 막힌다. 크기가 큰 테이블은 트래픽이 적은 시간대를 골라야 했다.
- InnoDB는 클러스터드 인덱스 구조 때문에 같은 데이터라도 디스크를 더 쓴다. 변환 전에 여유 공간을 확인해둘 필요가 있었다.

**변환 후 동작이 달라지는 경우**
- `WHERE` 없는 `COUNT(*)`: MyISAM은 행 수를 따로 저장해둬서 즉시 반환하지만, InnoDB는 전체를 스캔한다. 총 건수를 보여주는 쿼리가 갑자기 느려질 수 있다.
- 락 단위: 테이블 락에서 행 락으로 바뀌면서 동시성은 좋아지지만, 트랜잭션이 커밋까지 실제로 락을 잡게 되므로 전에 없던 데드락과 락 대기 타임아웃이 생길 수 있다.
- 롤백이 되기 시작하는 것 자체도 동작 변화다. 트랜잭션 안에서 쓰던 이력성 테이블이 있었다면, 지금까지는 예외가 나도 기록이 남았지만 변환 후에는 같이 롤백되어 사라진다. 의도하지 않았더라도 누군가 그 동작에 기대고 있었을 수 있다.

그래서 한 번에 전부 바꾸지 않고, 이 항목들에 걸리지 않아 **지금 바로 바꿔도 되는 테이블부터 순차적으로 전환**했다. 원자성 문제가 직접 드러난 `schedule`이 첫 번째였다.

```sql
ALTER TABLE schedule ENGINE = InnoDB;
```

이후로는 flush가 언제 일어나든, 커밋되지 않은 변경은 undo log를 통해 모두 되돌아간다. 확인이 더 필요한 테이블은 영향 범위를 파악한 뒤 바꾸는 쪽으로 남겨뒀다.

---

## 왜 이렇게 해결했는가?

### 대안 A: 조회 순서만 바꾸기

앞서 본 것처럼 증상을 피할 뿐이다. 게다가 "이 테이블을 만지는 모든 코드가 특정 순서를 지켜야 한다"는 규칙은 지켜질 거라 기대하기 어렵다.

### 대안 B: flush 모드를 COMMIT으로 변경

`FlushModeType.COMMIT`이면 Hibernate는 쿼리 전에 flush하지 않으므로 중간 UPDATE 자체가 사라진다. 이 메서드만 놓고 보면 문제도 없다. `findByInboundDate()`는 수정하지 않은 `inbound_date`로 조회하고, 결과가 이미 영속성 컨텍스트에 있는 엔티티라면 DB 값이 아니라 1차 캐시의 인스턴스가 그대로 반환되기 때문이다.

문제는 이 테이블을 쓰는 다른 쿼리들이다. flush되지 않은 변경은 DB가 모르기 때문에, DB가 판단하는 부분은 전부 수정 전 값 기준이 된다.

```java
before.adjustReservedInboundQty(-30);   // 메모리: 70, DB: 100

// 조건절: DB가 100 기준으로 판단 → before가 결과에서 빠짐
"select s from ScheduleEntity s where s.reservedQty < 80"

// 집계: DB 값 100으로 계산됨
"select sum(s.reservedQty) from ScheduleEntity s"

// 스칼라/DTO 조회: 1차 캐시를 거치지 않음 → 100
"select s.reservedQty from ScheduleEntity s where s.id = :id"
```

수정한 컬럼을 조건·집계·프로젝션에 쓰는 쿼리가 같은 트랜잭션에 섞이면, 에러 없이 조용히 틀린 결과가 나온다. 예약 수량처럼 조건과 합계로 자주 조회되는 값이라면 더 위험하다. 결국 롤백 문제를 없애는 대신 조회 정합성 문제를 새로 떠안는 셈이고, 커밋 시점에 두 UPDATE 중 하나만 성공하는 부분 실패도 여전히 막지 못한다.

### 선택: 엔진을 InnoDB로 변경

문제의 본질은 "롤백이 불가능한 테이블"이었다. 원인을 제거하는 방법은 엔진을 바꾸는 것 하나였다.

---

## 결과

Before:
- `schedule` 테이블이 MyISAM이라, 트랜잭션 도중 DB로 나간 UPDATE는 롤백되지 않았다.
- 예외 상황에서 예약 수량이 한쪽만 반영되는 정합성 문제가 발생했다.

After:
- 테이블을 InnoDB로 변경해, flush 시점과 관계없이 롤백 시 모든 변경이 되돌아간다.
- 같은 시나리오(중간 flush 후 예외)를 다시 재현해 두 행 모두 원래 값으로 돌아오는 것을 확인했다.
- DB 전체의 MyISAM 테이블을 파악하고, 변환해도 문제가 없는 테이블부터 순차적으로 InnoDB로 전환했다.

운영 반영 전 테스트 단계에서 발견해 실제 데이터 문제로 이어지지는 않았다. 만약 "`@Transactional`이 붙어 있으니 롤백되겠지"라고 믿고 넘어갔다면, 예약 수량이 조용히 어긋난 뒤에야 알았을 것이다.

---

## 배운 점

- `@Transactional`은 트랜잭션을 시작하고 끝내라는 요청일 뿐, 실제로 되돌릴 수 있는지는 스토리지 엔진이 결정한다. 원자성은 애플리케이션 코드만으로 완성되지 않는다.
- 증상을 없앴다고 원인을 찾은 건 아니다. 첫 가설로 증상이 사라졌을 때 멈췄다면, "왜 먼저 나간 UPDATE가 롤백되지 않았는가"라는 진짜 질문에는 도달하지 못했을 것이다.
- MySQL 5.5부터 기본 엔진이 InnoDB가 됐지만, 이 기본값은 새로 만드는 테이블에만 적용된다. 실제로 서버는 5.7이었는데도 레거시 테이블은 MyISAM 그대로였다. 서버 버전만 보고 "당연히 InnoDB겠지"라고 넘기면 안 된다. 레거시 DB를 다룬다면 전체 테이블의 엔진을 한 번은 확인해봐야 한다.
- 문제를 고치는 변경도 기존 동작을 바꾸는 변경이다. 롤백이 안 되던 테이블이 롤백되기 시작하는 것조차, 그 동작에 기대던 코드에게는 장애가 될 수 있다. 그래서 근본 해결일수록 한 번에 적용하기보다 영향 범위를 확인하며 나눠서 적용해야 한다.

---

## 참고

- [MySQL 공식 문서 - The InnoDB Storage Engine](https://dev.mysql.com/doc/refman/8.4/en/innodb-storage-engine.html)
- [Hibernate 공식 문서 - User Guide](https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html)
