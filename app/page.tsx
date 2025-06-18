import Header from '@/components/ui/Header';
import Footer from '@/components/ui/Footer';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Section from '@/components/ui/Section';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#0e0e0e] to-[#121212] text-white font-sans">
      <main className="flex flex-col items-center justify-center px-4 py-10">
        <Header
          title="Welcome To"
          highlight="ProFixIQ"
          subtitle="The AI-powered diagnostic platform built for pros and DIYers."
        />

        <Container className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-5xl">
          <Section>
            <Link href="/ai">
              <Card className="bg-black border border-orange-500 hover:shadow-orange transition-all">
                <h2 className="text-2xl font-bold text-white">AI Diagnosis</h2>
                <p className="text-gray-300 mt-2 text-sm">
                  Chat, Visual, and DTC Code Support
                </p>
              </Card>
            </Link>
          </Section>

          <Section>
            <Link href="/workorders">
              <Card className="bg-black border border-orange-500 hover:shadow-orange transition-all">
                <h2 className="text-2xl font-bold text-white">Work Orders</h2>
                <p className="text-gray-300 mt-2 text-sm">
                  Create, Edit, and Track Work Orders
                </p>
              </Card>
            </Link>
          </Section>

          <Section>
            <Link href="/inspections">
              <Card className="bg-black border border-orange-500 hover:shadow-orange transition-all">
                <h2 className="text-2xl font-bold text-white">Inspections</h2>
                <p className="text-gray-300 mt-2 text-sm">
                  CVIP, Used, Custom, and More
                </p>
              </Card>
            </Link>
          </Section>

          <Section>
            <Link href="/vin">
              <Card className="bg-black border border-orange-500 hover:shadow-orange transition-all">
                <h2 className="text-2xl font-bold text-white">VIN Decoder</h2>
                <p className="text-gray-300 mt-2 text-sm">
                  Decode and Analyze Vehicle Info
                </p>
              </Card>
            </Link>
          </Section>

          <Section>
            <Link href="/history">
              <Card className="bg-black border border-orange-500 hover:shadow-orange transition-all">
                <h2 className="text-2xl font-bold text-white">Repair History</h2>
                <p className="text-gray-300 mt-2 text-sm">
                  Track Issues by VIN and Customer
                </p>
              </Card>
            </Link>
          </Section>

          <Section>
            <Link href="/booking">
              <Card className="bg-black border border-orange-500 hover:shadow-orange transition-all">
                <h2 className="text-2xl font-bold text-white">Customer Booking</h2>
                <p className="text-gray-300 mt-2 text-sm">
                  Self-Service Scheduling with Quotes
                </p>
              </Card>
            </Link>
          </Section>
        </Container>
      </main>
      <Footer />
    </div>
  );
}