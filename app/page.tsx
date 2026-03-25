import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1>Testing</h1>
      <br />
      <Link href="/posts">kePostsPage</Link>
      <br />
      <Link href="/albums">keAlbumsPage</Link>
    </>
  );
}
