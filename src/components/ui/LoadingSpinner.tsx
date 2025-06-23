export default function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center">
      <svg
        className="animate-spin h-8 w-8 text-orange-500"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          className="opacity-25"
          fill="currentColor"
          d="M12 2a1 1 0 011 1v2.07a7.001 7.001 0 014.905 4.905H20a1 1 0 110 2h-2.07a7.001 7.001 0 01-4.905 4.905V21a1 1 0 11-2 0v-2.07A7.001 7.001 0 017.095 14.93H5a1 1 0 110-2h2.07A7.001 7.001 0 0112 5.07V3a1 1 0 011-1z"
        />
      </svg>
    </div>
  );
}