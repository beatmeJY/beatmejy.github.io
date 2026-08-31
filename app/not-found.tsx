import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">페이지를 찾을 수 없습니다</h1>
      <p className="mt-3 text-muted">주소가 바뀌었거나 글이 없을 수 있습니다.</p>
      <p className="mt-6">
        <Link href="/" className="text-accent hover:text-accent-hover">
          홈으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
